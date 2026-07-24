'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { reportOperationalError } from '@/lib/server/observability';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
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
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

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
    await capture(user.id, ANALYTICS_EVENTS.inviteResponded, {
      accepted: data === 'accepted',
      outcome: typeof data === 'string' ? data : null,
    });
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

/**
 * Link the guest invite behind `token` to the signed-in account. Called after
 * an invited guest creates an account (or signs in) and lands back on their
 * invite link — without this the invite stays a guest row (invitee_id null) and
 * never shows up on their home / plans / notifications. The token is the
 * authorization; the DB function no-ops for a logged-out caller or an
 * already-claimed invite. Best-effort: a failure here must never break the
 * public RSVP page, so callers ignore the result.
 */
export async function claimGuestInvite(token: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: eventId, error } = await supabase.rpc('claim_guest_invite', {
    p_token: token,
  });
  // A null eventId is a normal no-op (already claimed); an error is not — it
  // means the claim machinery itself is broken (e.g. the claim_guest_invites
  // migration was never applied to this database), which otherwise hides as
  // "invites silently never appear in the app". Never log the token: it's the
  // RSVP capability secret.
  if (error) {
    await reportOperationalError('invite-claim.token', error, {});
    return { ok: false };
  }
  if (!eventId) return { ok: false };

  revalidatePath('/');
  revalidatePath('/plans');
  revalidatePath('/notifications');
  return { ok: true };
}

export interface ShareLinkRsvpResult extends RespondResult {
  /**
   * The responder's own durable RSVP token, so the caller can send them on to
   * `/rsvp/<token>` — the same page a directly-invited guest lands on, where
   * they can add the plan to a calendar or change their answer later.
   */
  token?: string;
}

/**
 * RSVP through a plan's public share link (`/i/<share_token>`).
 *
 * This is the path for someone who was never added to the plan by hand: they
 * were texted the link, they have no account, and they should be able to answer
 * anyway. Possession of the unguessable share token is the authorization
 * (docs/SECURITY.md §5); the database function re-locks the event, honours
 * capacity, and refuses a plan whose link is switched off or that is no longer
 * taking answers.
 *
 * The caller id is resolved here from the session and passed explicitly — never
 * taken from the client — because auth.uid() is null under the service role.
 */
export async function respondViaShareLink(
  shareToken: string,
  accept: boolean,
  name: string,
  contact: string | null = null,
): Promise<ShareLinkRsvpResult> {
  // Rate-limited per link: the share token is public by design, so this is the
  // one place a stranger can create invite rows (docs/SECURITY.md §9).
  if (!(await checkRateLimit(`share-rsvp:${shareToken}`, 20, 60 * 60))) {
    return { ok: false, error: 'Too many attempts. Try again later.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('rsvp_via_share_token', {
    p_token: shareToken,
    p_user: user?.id ?? null,
    p_name: name,
    p_contact: contact,
    p_accept: accept,
  });
  if (error) {
    await reportOperationalError('share-rsvp.respond', error, {});
    return { ok: false, error: 'Could not record your RSVP. Try again.' };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const outcome = typeof row?.outcome === 'string' ? row.outcome : null;
  if (!outcome) return { ok: false, error: 'This invitation isn’t available.' };
  if (outcome === 'link_off') {
    return { ok: false, outcome, error: 'This invite link has been turned off.' };
  }
  if (outcome === 'not_accepting') {
    return { ok: false, outcome, error: 'This plan isn’t taking answers right now.' };
  }
  if (outcome === 'name_required') {
    return { ok: false, outcome, error: 'Please add your name so the host knows who’s coming.' };
  }

  const eventId = await eventIdForShareToken(admin, shareToken);
  if (eventId) {
    await advanceEventCascade(eventId);
    if (outcome === 'accepted') {
      const { data: event } = await admin
        .from('events')
        .select('id, title, host_id')
        .eq('id', eventId)
        .maybeSingle();
      if (event) {
        await notifyUsers([event.host_id], {
          kind: 'rsvp_accepted',
          title: 'Someone’s in 🎉',
          body: `${name || 'A guest'} accepted your invitation to ${event.title}.`,
          url: `/events/${event.id}`,
        });
      }
    }
    revalidatePath(`/events/${eventId}`);
  }

  return {
    ok: true,
    outcome,
    token: typeof row?.token === 'string' ? row.token : undefined,
  };
}

async function eventIdForShareToken(
  admin: AnswerClient,
  shareToken: string,
): Promise<string | null> {
  const { data } = await admin
    .from('events')
    .select('id')
    .eq('share_token', shareToken)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
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
