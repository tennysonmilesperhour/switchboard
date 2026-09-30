'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { failure } from '@/lib/errors';
import { checkRateLimit } from '@/lib/server/rate-limit';
import type { RespondResult } from '@/lib/actions/invites';

/**
 * Open Table: friends of a plan's guests ask for a seat, and the host (or a
 * co-host) answers. Split from `invites.ts`, which answers invitations; this
 * is the other direction — someone asking to be invited.
 */

/**
 * The Give Space heads-up decision (`noteGiveSpaceOverlap` in `invites.ts`),
 * for a person who has no session in this request: the Open Table requester
 * whose join the host has just approved.
 *
 * Service-role, and deliberately narrow — the database function re-checks that
 * `userId` really does hold an accepted invite to `eventId` before it reads or
 * writes anything, so a host cannot use this to learn or plant anything about
 * a guest. Nothing is returned to the caller: the host must not find out what
 * it decided.
 */
async function noteGiveSpaceOverlapFor(userId: string, eventId: string): Promise<void> {
  try {
    await createAdminClient().rpc('note_give_space_overlap_for', {
      p_user: userId,
      p_event: eventId,
    });
  } catch (error) {
    await reportOperationalError('give-space.note', error, { eventId });
  }
}

/**
 * How many times one person may ask to join one plan in a day. A request the
 * host turns down leaves no row behind (see `decline_join_request`), so without
 * a ceiling "Not this time" could be answered with an immediate re-ask, and
 * every ask reaches the host and each co-host.
 */
const JOIN_ASKS_PER_DAY = 3;

/** Open Table: ask to join a friends-of-friends event. */
export async function requestToJoin(eventId: string): Promise<RespondResult> {
  const auth = await requireUser();
  if (!auth.ok) {
    return failure('SB-RSVP-AUTH', 'Sign in to request to join.');
  }
  const { supabase, user } = auth;
  if (!(await checkRateLimit(`join-request:${user.id}:${eventId}`, JOIN_ASKS_PER_DAY, 24 * 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve asked to join this plan a few times today. Try again tomorrow.');
  }
  // The request_to_join RPC already keys the row on auth.uid(); this app-layer
  // session check just fails fast (and keeps the admin notify below from firing
  // for an unauthenticated caller) rather than relying on the RPC alone.
  const { error } = await supabase.rpc('request_to_join', { p_event: eventId });
  if (error) return reportAndFail('SB-RSVP-SAVE', 'join.request', error, { eventId });

  // Let everyone who can answer know a request is waiting: the host and every
  // co-host (`approve_join_request` admits them all). The co-hosts used to hear
  // nothing, so a request could sit unseen behind a host who was away.
  const admin = createAdminClient();
  const [{ data: event }, { data: cohosts }] = await Promise.all([
    admin.from('events').select('id, title, host_id').eq('id', eventId).maybeSingle(),
    admin.from('event_cohosts').select('cohost_id').eq('event_id', eventId),
  ]);
  const managers = [
    ...new Set([event?.host_id, ...(cohosts ?? []).map((row) => row.cohost_id)]),
  ].filter((id): id is string => Boolean(id) && id !== user.id);
  if (event && managers.length > 0) {
    await notifyUsers(managers, {
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
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase.rpc('approve_join_request', {
    p_invite: inviteId,
  });
  if (error) return reportAndFail('SB-RSVP-SAVE', 'join.approve', error, { inviteId, eventId });

  if (data === 'accepted') {
    const { data: invite } = await supabase
      .from('invites')
      .select('invitee_id, event:events(title)')
      .eq('id', inviteId)
      .single();
    const event = Array.isArray(invite?.event) ? invite?.event[0] : invite?.event;
    if (invite?.invitee_id) {
      // Their commitment, completed by someone else's approval. The requester
      // has no session here, so this runs service-role against their id — and
      // the function still refuses unless that id now holds an accepted invite
      // to this exact plan.
      await noteGiveSpaceOverlapFor(invite.invitee_id, eventId);
      await notifyUsers([invite.invitee_id], {
        kind: 'join_approved',
        title: 'You are in 🎉',
        body: `The host welcomed you to ${event?.title ?? 'the event'}.`,
        url: `/events/${eventId}`,
      });
    }
  } else if (data === 'pending_approval') {
    // The host said yes on a plan that needs a guardian's OK too. The
    // requester asks their guardian from the plan page, which now shows the
    // held request with the form to send it.
    const { data: invite } = await supabase
      .from('invites')
      .select('invitee_id, event:events(title)')
      .eq('id', inviteId)
      .single();
    const event = Array.isArray(invite?.event) ? invite?.event[0] : invite?.event;
    if (invite?.invitee_id) {
      await notifyUsers([invite.invitee_id], {
        kind: 'join_approved',
        title: 'One more step',
        body: `The host said yes to ${event?.title ?? 'the plan'}. A parent or guardian needs to approve it before it counts.`,
        url: `/events/${eventId}`,
      });
    }
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true, outcome: typeof data === 'string' ? data : undefined };
}

/**
 * Open Table: the host (or a co-host) says "Not this time".
 *
 * `/join` promises a requester they will hear back either way, and this used
 * to be a bare DELETE that told them nothing. The database function checks the
 * caller manages the plan and that the request is still waiting, removes it,
 * and says whose it was, so the requester can be told.
 *
 * The plan is read from the request itself, through the caller's own session,
 * never from the `eventId` the client sent: the notification names the plan,
 * and a mismatched id must not put another plan's title in someone's inbox.
 */
export async function declineJoinRequest(
  inviteId: string,
  eventId: string,
): Promise<RespondResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data: request, error: readError } = await supabase
    .from('invites')
    .select('event_id, event:events(title)')
    .eq('id', inviteId)
    .maybeSingle();
  if (readError) {
    return reportAndFail('SB-RSVP-SAVE', 'join.decline', readError, { inviteId, eventId });
  }
  const { data: requesterId, error } = await supabase.rpc('decline_join_request', {
    p_invite: inviteId,
  });
  if (error) return reportAndFail('SB-RSVP-SAVE', 'join.decline', error, { inviteId, eventId });
  revalidatePath(`/events/${request?.event_id ?? eventId}`);
  // Already answered — by a co-host, a second tab, or the plan filling up.
  if (!requesterId || !request) return { ok: true, outcome: 'gone' };

  const event = Array.isArray(request.event) ? request.event[0] : request.event;
  await notifyUsers([requesterId], {
    kind: 'join_declined',
    title: 'Not this time',
    body: `The host of ${event?.title ?? 'the plan'} couldn’t make room for you this time. Thanks for asking.`,
    // The plan is closed to them now; Explore is where the other open tables are.
    url: '/discover',
  });
  revalidatePath('/discover');
  return { ok: true, outcome: 'declined' };
}
