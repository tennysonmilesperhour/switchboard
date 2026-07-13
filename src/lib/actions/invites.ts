'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import type { DeclineNote } from '@/lib/types';
import { checkRateLimit } from '@/lib/server/rate-limit';

export interface RespondResult {
  ok: boolean;
  outcome?: 'accepted' | 'declined' | 'waitlisted' | string;
  error?: string;
}

type AnswerClient = ReturnType<typeof createAdminClient>;

/**
 * Persist RSVP answers for an accepted invite, keeping only answers whose
 * question actually belongs to this event (M1: don't trust client-supplied
 * question_ids). Called only once an invite is confirmed accepted (M2: never
 * store answers for a declined or waitlisted RSVP).
 */
async function saveInviteAnswers(
  client: AnswerClient,
  inviteId: string,
  eventId: string,
  answers: Record<string, string>,
): Promise<void> {
  const trimmed = Object.entries(answers)
    .map(([question_id, answer]) => ({ question_id, answer: answer.trim() }))
    .filter((row) => row.answer.length > 0);
  if (trimmed.length === 0) return;

  const { data: questions } = await client
    .from('event_questions')
    .select('id')
    .eq('event_id', eventId);
  const valid = new Set((questions ?? []).map((q) => q.id));

  const rows = trimmed
    .filter((row) => valid.has(row.question_id))
    .map((row) => ({
      invite_id: inviteId,
      question_id: row.question_id,
      answer: row.answer,
    }));
  if (rows.length === 0) return;

  await client
    .from('invite_answers')
    .upsert(rows, { onConflict: 'invite_id,question_id' });
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
    if (data === 'accepted') {
      // Only persist answers once accepted, and only for this event's questions.
      await saveInviteAnswers(supabase, inviteId, invite.event_id, answers);
    }
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
        await notifyUsers([event.host_id], {
          kind: 'rsvp_accepted',
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
  // The request_to_join RPC already keys the row on auth.uid(); this app-layer
  // session check just fails fast (and keeps the admin notify below from firing
  // for an unauthenticated caller) rather than relying on the RPC alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sign in to request to join.' };

  const { error } = await supabase.rpc('request_to_join', { p_event: eventId });
  if (error) return { ok: false, error: error.message };

  // Let the host know a request is waiting — previously this fired nothing at
  // all, so requests sat unseen until the host happened to open the event.
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('id, title, host_id')
    .eq('id', eventId)
    .maybeSingle();
  if (event?.host_id) {
    await notifyUsers([event.host_id], {
      kind: 'join_request',
      title: 'Someone wants in 👋',
      body: `A new request to join ${event.title} is waiting for your OK.`,
      url: `/events/${event.id}`,
    });
  }

  revalidatePath('/discover');
  revalidatePath(`/events/${eventId}`);
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
      await notifyUsers([invite.invitee_id], {
        kind: 'join_approved',
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
  if (!(await checkRateLimit(`guest-rsvp:${token}`, 10, 60 * 60))) {
    return { ok: false, error: 'Too many attempts. Try again later.' };
  }
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

  // Atomic capacity-checked accept/decline under a row lock, keyed by the guest
  // token. Shares the event-row lock with respond_to_invite, so registered and
  // guest accepts serialize and capacity can never be exceeded.
  const { data: outcome, error } = await admin.rpc('respond_to_guest_invite', {
    p_token: token,
    p_accept: accept,
  });
  if (error) return { ok: false, error: error.message };

  if (outcome === 'accepted') {
    // Only persist answers once accepted, and only for this event's questions.
    await saveInviteAnswers(admin, invite.id, invite.event_id, answers);
  }

  await advanceEventCascade(invite.event_id);

  if (outcome === 'accepted') {
    const { data: event } = await admin
      .from('events')
      .select('id, title, host_id')
      .eq('id', invite.event_id)
      .single();
    if (event) {
      await notifyUsers([event.host_id], {
        kind: 'rsvp_accepted',
        title: 'Someone’s in 🎉',
        body: `${invite.guest_name ?? 'A guest'} accepted your invitation to ${event.title}.`,
        url: `/events/${event.id}`,
      });
    }
  }
  return { ok: true, outcome: typeof outcome === 'string' ? outcome : undefined };
}
