'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUsers } from '@/lib/server/notify';
import { sendEmails, looksLikeEmail, appUrl } from '@/lib/server/email';
import type { Invite, SwitchboardEvent } from '@/lib/types';

export interface AnnouncementResult {
  ok: boolean;
  error?: string;
}

/**
 * Host broadcast to everyone who's in - the calm version of a "text blast".
 * The note lands on the event page, in the Living Room, and as a push to
 * registered attendees / an email to guests. One-way and host-only.
 */
export async function postAnnouncement(
  eventId: string,
  body: string,
): Promise<AnnouncementResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: 'Write something first' };
  if (trimmed.length > 2000) return { ok: false, error: 'That’s a bit long' };

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // RLS enforces host-only insert; this fails cleanly for non-hosts.
  const { error } = await supabase
    .from('announcements')
    .insert({ event_id: eventId, author_id: user.id, body: trimmed });
  if (error) return { ok: false, error: error.message };

  // Fan-out is best-effort - the announcement is already saved.
  try {
    await fanOutAnnouncement(eventId, user.id, trimmed);
  } catch (fanError) {
    console.error('Announcement fan-out failed', fanError);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

async function fanOutAnnouncement(
  eventId: string,
  hostId: string,
  body: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, room_id, location_name')
    .eq('id', eventId)
    .single<Pick<SwitchboardEvent, 'id' | 'title' | 'room_id' | 'location_name'>>();
  if (!event) return;

  const { data: invites } = await admin
    .from('invites')
    .select('invitee_id, guest_name, guest_contact, guest_token, status')
    .eq('event_id', eventId)
    .eq('status', 'accepted')
    .returns<
      Pick<Invite, 'invitee_id' | 'guest_name' | 'guest_contact' | 'guest_token' | 'status'>[]
    >();
  const accepted = invites ?? [];

  const users = accepted
    .map((i) => i.invitee_id)
    .filter((id): id is string => Boolean(id) && id !== hostId);
  if (users.length > 0) {
    await sendPushToUsers(
      users,
      {
        title: `Update: ${event.title}`,
        body,
        url: `/events/${event.id}`,
      },
      'plans',
    );
  }

  const emails = accepted
    .filter((i) => !i.invitee_id && looksLikeEmail(i.guest_contact) && i.guest_token)
    .map((i) => ({
      to: i.guest_contact as string,
      subject: `Update: ${event.title}`,
      text:
        `${body}\n\n- from your host on Switchboard\n` +
        `Event details: ${appUrl(`/rsvp/${i.guest_token}`)}`,
    }));
  if (emails.length > 0) {
    await sendEmails(emails);
  }

  // Also drop it into the Living Room so the note has a permanent home.
  if (event.room_id) {
    await admin.from('messages').insert({
      room_id: event.room_id,
      sender_id: hostId,
      body: `📣 ${body}`,
    });
  }
}
