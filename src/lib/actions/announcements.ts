'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { appUrl, guestEmailHeaders, looksLikeEmail, sendEmails } from '@/lib/server/email';
import { reportAndFail } from '@/lib/server/observability';

export interface AnnouncementResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
}

/**
 * Host broadcast to everyone who's in - the calm version of a "text blast".
 * The note lands on the event page, in the Living Room, and as a push to
 * registered attendees / an email to guests. One-way, and only the host and
 * co-hosts may post.
 */
export async function postAnnouncement(
  eventId: string,
  body: string,
): Promise<AnnouncementResult> {
  const trimmed = body.trim();
  if (!trimmed) return validation('Write something first');
  if (trimmed.length > 2000) return validation('That’s a bit long');

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Every post pushes to, and emails, everyone who is in.
  if (!(await checkRateLimit(`announcement:${user.id}`, 10, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve posted a lot of updates. Give it a while.');
  }

  // RLS lets only the host and co-hosts insert. That refusal is the answer, not
  // an outage: retrying cannot change who runs the plan.
  const { error } = await supabase
    .from('announcements')
    .insert({ event_id: eventId, author_id: user.id, body: trimmed });
  if (error) {
    if (error.code === '42501') {
      return failure('SB-PERM-DENIED', 'Only the host and co-hosts can post updates to this plan.');
    }
    return reportAndFail('SB-ANNOUNCEMENT-SAVE', 'announcement.save', error, { eventId });
  }

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
  /** Whoever posted it: the host or a co-host. */
  authorId: string,
  body: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, room_id, location_name, host_id')
    .eq('id', eventId)
    .single();
  if (!event) return;
  // Co-hosts can post too, and the people running the plan with them are not
  // invitees, so an update a co-host sent never reached the host (or the other
  // co-hosts). Everyone running the plan hears it, except whoever wrote it.
  const { data: cohosts } = await admin
    .from('event_cohosts')
    .select('cohost_id')
    .eq('event_id', eventId);
  const organisers = [event.host_id, ...(cohosts ?? []).map((row) => row.cohost_id)];

  const { data: invites } = await admin
    .from('invites')
    .select('invitee_id, guest_name, guest_contact, guest_token, status')
    .eq('event_id', eventId)
    .eq('status', 'accepted');
  const accepted = invites ?? [];

  const users = [
    ...new Set(
      [...accepted.map((i) => i.invitee_id), ...organisers].filter(
        (id): id is string => Boolean(id) && id !== authorId,
      ),
    ),
  ];
  if (users.length > 0) {
    await notifyUsers(users, {
        kind: 'announcement',
        title: `Update: ${event.title}`,
        body,
        url: `/events/${event.id}`,
      });
  }

  const guests = accepted.filter(
    (i) => !i.invitee_id && looksLikeEmail(i.guest_contact) && i.guest_token,
  );
  if (guests.length > 0) {
    const signedBy = await announcementSignature(admin, authorId, event.host_id);
    await sendEmails(
      guests.map((i) => ({
        to: i.guest_contact as string,
        subject: `Update: ${event.title}`,
        text:
          `${body}\n\n- from ${signedBy} on Switchboard\n` +
          `Event details: ${appUrl(`/rsvp/${i.guest_token}`)}`,
        headers: guestEmailHeaders(),
      })),
    );
  }

  // Also drop it into the Living Room so the note has a permanent home.
  if (event.room_id) {
    await admin.from('messages').insert({
      room_id: event.room_id,
      sender_id: authorId,
      body: body,
    });
  }
}

/**
 * Who a guest's email says the update is from. A co-host's note used to be
 * signed "your host", which put words in the host's mouth. It names whoever
 * wrote it; with no name to use, only the host's own note says "your host".
 */
async function announcementSignature(
  admin: ReturnType<typeof createAdminClient>,
  authorId: string,
  hostId: string,
): Promise<string> {
  const { data: author } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', authorId)
    .maybeSingle();
  const name = author?.display_name?.replace(/\s+/g, ' ').trim();
  if (name) return name;
  return authorId === hostId ? 'your host' : 'the hosts';
}
