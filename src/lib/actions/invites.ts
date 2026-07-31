'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { failure, type ErrorCode } from '@/lib/errors';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import type { DeclineNote } from '@/lib/types';
import { checkRateLimit } from '@/lib/server/rate-limit';

export interface RespondResult {
  ok: boolean;
  outcome?: 'accepted' | 'declined' | 'waitlisted' | string;
  error?: string;
  /**
   * Stable code for the failure, from `@/lib/errors`. Rendered beside the
   * message so a report is a diagnosis rather than a starting point, and logged
   * with the same value server-side so the two join up.
   */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  /**
   * The plan this answer belongs to, so the RSVP page can hand the responder
   * onward to `/events/<id>` — the thread, the updates, and everyone else who
   * is coming — instead of ending at the confirmation card.
   */
  eventId?: string;
  /** Nonfatal follow-up when the RSVP saved but account attachment did not. */
  warning?: string;
}

function cleanDeclineMessage(value: string): string | null {
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 280);
  return cleaned || null;
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
  declineMessage = '',
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
    const message = !accept ? cleanDeclineMessage(declineMessage) : null;
    if (!accept) {
      const { error: messageError } = await supabase
        .from('invites')
        .update({ decline_message: message })
        .eq('id', inviteId);
      if (messageError) {
        await reportOperationalError('invite-decline.message', messageError, {
          eventId: invite.event_id,
        });
      }
    }
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
    } else if (data === 'declined' && message) {
      const admin = createAdminClient();
      const { data: event } = await admin
        .from('events')
        .select('id, title, host_id')
        .eq('id', invite.event_id)
        .maybeSingle();
      if (event) {
        await notifyUsers([event.host_id], {
          kind: 'rsvp_declined_note',
          title: 'A guest left a note',
          body: `Someone declined ${event.title}: “${message}”`,
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
export async function claimGuestInvite(
  token: string,
): Promise<{ ok: boolean; eventId?: string }> {
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
  return { ok: true, eventId };
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
 * were texted the link and they can read the whole plan without an account.
 * Answering is where an account starts mattering — a session is required here,
 * so the host ends up with a person they can see and re-invite rather than an
 * unreachable name, and the responder gets the plan in their app.
 *
 * Possession of the unguessable share token is still the authorization
 * (docs/SECURITY.md §5); being signed in is an added requirement, not a
 * replacement for holding the link. The database function re-checks the session
 * id it is handed, re-locks the event, honours capacity, and refuses a plan
 * whose link is switched off or that is no longer taking answers.
 *
 * The caller id is resolved here from the session and passed explicitly — never
 * taken from the client — because auth.uid() is null under the service role.
 */
export async function respondViaShareLink(
  shareToken: string,
  accept: boolean,
  name = '',
  contact: string | null = null,
): Promise<ShareLinkRsvpResult> {
  // Viewing the plan never needs an account; answering it does. Checked first,
  // and before the service-role client is touched: the page shows the sign-in
  // gate, this is the backstop for a session that expired while the page sat
  // open — and signed-out traffic must not spend the rate-limit budget that
  // belongs to the people who can actually answer.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ...failure('SB-RSVP-AUTH', 'Sign in to RSVP - it takes a moment.'),
      outcome: 'auth_required',
    };
  }

  // Rate-limited per link: the share token is public by design, so this is the
  // one place a stranger can create invite rows (docs/SECURITY.md §9).
  if (!(await checkRateLimit(`share-rsvp:${shareToken}`, 20, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'Too many attempts. Try again later.');
  }

  const admin = createAdminClient();

  // The host sees a real name, not whatever the browser posted: prefer the
  // signed-in profile's display name and treat the client's value as the
  // fallback for an account that somehow has none yet.
  const { data: profile } = await admin
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle<{ display_name: string | null }>();
  const responderName = profile?.display_name?.trim() || name;

  const { data, error } = await admin.rpc('rsvp_via_share_token', {
    p_token: shareToken,
    p_user: user.id,
    p_name: responderName,
    p_contact: contact,
    p_accept: accept,
  });
  if (error) {
    return {
      ...(await reportAndFail('SB-RSVP-SAVE', 'share-rsvp.respond', error)),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const outcome = typeof row?.outcome === 'string' ? row.outcome : null;
  if (!outcome) return failure('SB-LINK-UNKNOWN', 'This invitation isn’t available.');
  if (outcome === 'link_off') {
    return {
      ...failure('SB-LINK-OFF', 'This invite link has been turned off.'),
      outcome,
    };
  }
  if (outcome === 'not_accepting') {
    return {
      ...failure('SB-RSVP-CLOSED', 'This plan isn’t taking answers right now.'),
      outcome,
    };
  }
  // The database enforces the same session requirement this action does, so
  // this only surfaces if the two ever disagree — say the migration behind it
  // has not been applied. Report it the same way, never as a generic failure.
  if (outcome === 'auth_required') {
    return {
      ...failure('SB-RSVP-AUTH', 'Sign in to RSVP - it takes a moment.'),
      outcome,
    };
  }
  if (outcome === 'name_required') {
    return {
      ...failure('SB-RSVP-NAME', 'Please add your name so the host knows who’s coming.'),
      outcome,
    };
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
          body: `${responderName || 'A guest'} accepted your invitation to ${event.title}.`,
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

/**
 * Answer a per-person invitation via its guest token (`/rsvp/<guest_token>`).
 *
 * The link opens for anyone: an invited guest reads the plan, the time, and the
 * place with no account and no app. The answer is the part that needs a signed-in
 * account — the same rule as the public share link, so a recipient never has to
 * guess which kind of link they were sent. The page renders a sign-in gate in
 * place of the buttons; this check is what makes the gate real.
 *
 * The token remains the authorization for *this* invitation (docs/SECURITY.md
 * §5) — the session is an added requirement. Answering also binds the invite to
 * the account, which is what lets the responder open `/events/<id>` afterwards:
 * every in-app surface, and the event page's own RLS, finds a person's invite by
 * `invitee_id = auth.uid()`, so an accepted invite still carrying
 * `invitee_id = null` leaves them unable to reach the plan they just said yes
 * to. The page also claims on load, but that is a best-effort client effect;
 * this is the path every answer goes through.
 */
export async function respondToGuestInvite(
  token: string,
  accept: boolean,
  answers: Record<string, string> = {},
  note: DeclineNote = null,
  declineMessage = '',
): Promise<RespondResult> {
  // Session first, then the budget: a signed-out visitor can't answer, and must
  // not be able to burn through the invited guest's rate-limit allowance trying.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ...failure('SB-RSVP-AUTH', 'Sign in to RSVP - it takes a moment.'),
      outcome: 'auth_required',
    };
  }

  if (!(await checkRateLimit(`guest-rsvp:${token}`, 10, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'Too many attempts. Try again later.');
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

  const message = outcome === 'declined' ? cleanDeclineMessage(declineMessage) : null;
  if (outcome === 'declined') {
    const { error: noteError } = await admin
      .from('invites')
      .update({ decline_note: note, decline_message: message })
      .eq('id', invite.id);
    if (noteError) {
      await reportOperationalError('guest-rsvp.decline-note', noteError, {
        eventId: invite.event_id,
      });
    }
  }

  // Bind the invite to the account that answered, mirroring what
  // `rsvp_via_share_token` does inline for the share link. Without this an
  // accepted guest is a row with `invitee_id = null`: invisible on /plans, in
  // notifications, and — because the event page resolves the viewer's invite by
  // `invitee_id` — unable to open the plan, its thread, or its updates at all.
  // Idempotent and keyed by the same token that authorized the answer; a null
  // return just means there was nothing left to claim.
  const { data: claimedEventId, error: claimError } = await supabase.rpc(
    'claim_guest_invite',
    {
      p_token: token,
    },
  );
  // Never fail the answer over this — the RSVP itself is already recorded. But
  // do surface it, because a silent failure here is exactly what makes an
  // invitation vanish from the app after someone accepts it.
  if (claimError) {
    await reportOperationalError('guest-rsvp.claim', claimError, {
      eventId: invite.event_id,
    });
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
  } else if (outcome === 'declined' && message) {
    const { data: event } = await admin
      .from('events')
      .select('id, title, host_id')
      .eq('id', invite.event_id)
      .maybeSingle();
    if (event) {
      await notifyUsers([event.host_id], {
        kind: 'rsvp_declined_note',
        title: 'A guest left a note',
        body: `${invite.guest_name ?? 'A guest'} declined ${event.title}: “${message}”`,
        url: `/events/${event.id}`,
      });
    }
  }

  if (claimedEventId) {
    // The invite now belongs to this account, so the surfaces that list it by
    // `invitee_id` are stale.
    revalidatePath('/');
    revalidatePath('/plans');
    revalidatePath(`/events/${invite.event_id}`);
  }

  return {
    ok: true,
    outcome: typeof outcome === 'string' ? outcome : undefined,
    // Only offer an onward route when the claim actually succeeded. Returning
    // the id after an RPC error would render a link to an RLS-gated page that
    // immediately bounces the responder back out.
    eventId: claimedEventId ?? undefined,
    warning: claimError
      ? 'Your RSVP was saved, but we could not add the plan to your account yet.'
      : undefined,
  };
}
