'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { sendPushToUsers } from '@/lib/server/notify';
import type { DeclineNote } from '@/lib/types';

export interface RespondResult {
  ok: boolean;
  outcome?: 'accepted' | 'declined' | 'waitlisted' | string;
  error?: string;
}

export async function respondToInvite(
  inviteId: string,
  accept: boolean,
  note: DeclineNote = null,
  answers: Record<string, string> = {},
): Promise<RespondResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // Save any RSVP question answers first (RLS lets an invitee write their own).
  const answerRows = Object.entries(answers)
    .map(([question_id, answer]) => ({
      invite_id: inviteId,
      question_id,
      answer: answer.trim(),
    }))
    .filter((row) => row.answer.length > 0);
  if (accept && answerRows.length > 0) {
    await supabase
      .from('invite_answers')
      .upsert(answerRows, { onConflict: 'invite_id,question_id' });
  }

  // Atomic capacity-checked transition, then a cascade tick.
  const { data, error } = await supabase.rpc('respond_to_invite', {
    p_invite: inviteId,
    p_accept: accept,
    p_note: note,
  });
  if (error) return { ok: false, error: error.message };

  const { data: invite } = await supabase
    .from('invites')
    .select('event_id')
    .eq('id', inviteId)
    .single();

  if (invite) {
    await advanceEventCascade(invite.event_id);

    if (data === 'accepted') {
      const admin = createAdminClient();
      const { data: event } = await admin
        .from('events')
        .select('id, title, host_id, room_id')
        .eq('id', invite.event_id)
        .single();
      if (event) {
        // Accepted invitees join the event's Living Room.
        if (event.room_id) {
          await admin
            .from('room_members')
            .upsert({ room_id: event.room_id, member_id: user.id });
        }
        await sendPushToUsers([event.host_id], {
          title: 'Someone’s in 🎉',
          body: `Your invitation to ${event.title} was accepted.`,
          url: `/events/${event.id}`,
        });
      }
    }
    revalidatePath(`/events/${invite.event_id}`);
  }
  revalidatePath('/');
  revalidatePath('/plans');
  return { ok: true, outcome: typeof data === 'string' ? data : undefined };
}

/** Open Table: ask to join a friends-of-friends event. */
export async function requestToJoin(eventId: string): Promise<RespondResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('request_to_join', { p_event: eventId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/discover');
  return { ok: true, outcome: 'requested' };
}

/** Open Table: host approves a join request (capacity-checked in the DB). */
export async function approveJoinRequest(
  inviteId: string,
  eventId: string,
): Promise<RespondResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('approve_join_request', {
    p_invite: inviteId,
  });
  if (error) return { ok: false, error: error.message };

  if (data === 'accepted') {
    const { data: invite } = await supabase
      .from('invites')
      .select('invitee_id, event:events(title)')
      .eq('id', inviteId)
      .single();
    const event = Array.isArray(invite?.event) ? invite?.event[0] : invite?.event;
    if (invite?.invitee_id) {
      await sendPushToUsers([invite.invitee_id], {
        title: 'You are in 🎉',
        body: `The host welcomed you to ${event?.title ?? 'the event'}.`,
        url: `/events/${eventId}`,
      });
    }
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, outcome: typeof data === 'string' ? data : undefined };
}

export async function declineJoinRequest(
  inviteId: string,
  eventId: string,
): Promise<RespondResult> {
  const supabase = await createClient();
  // Host-only via RLS delete policy on invites.
  const { error } = await supabase.from('invites').delete().eq('id', inviteId);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Guest RSVP via token - no account required. */
export async function respondToGuestInvite(
  token: string,
  accept: boolean,
  answers: Record<string, string> = {},
): Promise<RespondResult> {
  const admin = createAdminClient();

  const { data: invite } = await admin
    .from('invites')
    .select('id, event_id, status, guest_name')
    .eq('guest_token', token)
    .single();
  if (!invite) return { ok: false, error: 'Invitation not found' };
  if (invite.status !== 'sent') {
    return { ok: false, outcome: invite.status, error: 'This invitation is no longer active' };
  }

  // Persist RSVP answers (service role - guests have no auth session).
  const answerRows = Object.entries(answers)
    .map(([question_id, answer]) => ({
      invite_id: invite.id,
      question_id,
      answer: answer.trim(),
    }))
    .filter((row) => row.answer.length > 0);
  if (accept && answerRows.length > 0) {
    await admin
      .from('invite_answers')
      .upsert(answerRows, { onConflict: 'invite_id,question_id' });
  }

  if (!accept) {
    await admin
      .from('invites')
      .update({ status: 'declined', responded_at: new Date().toISOString() })
      .eq('id', invite.id);
    await advanceEventCascade(invite.event_id);
    return { ok: true, outcome: 'declined' };
  }

  // Capacity check mirrors respond_to_invite, executed with a fresh read.
  const { data: event } = await admin
    .from('events')
    .select('id, title, host_id, capacity, invite_mode')
    .eq('id', invite.event_id)
    .single();
  if (!event) return { ok: false, error: 'Event not found' };

  const { count: accepted } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', event.id)
    .eq('status', 'accepted');

  const cap =
    event.capacity ?? (event.invite_mode === 'individual' ? 1 : null);
  const outcome =
    cap !== null && (accepted ?? 0) >= cap ? 'waitlisted' : 'accepted';

  await admin
    .from('invites')
    .update({ status: outcome, responded_at: new Date().toISOString() })
    .eq('id', invite.id)
    .eq('status', 'sent');

  await advanceEventCascade(event.id);
  if (outcome === 'accepted') {
    await sendPushToUsers([event.host_id], {
      title: 'Someone’s in 🎉',
      body: `${invite.guest_name ?? 'A guest'} accepted your invitation to ${event.title}.`,
      url: `/events/${event.id}`,
    });
  }
  return { ok: true, outcome };
}
