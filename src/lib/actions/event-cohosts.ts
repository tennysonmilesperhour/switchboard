'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import type { ActionResult } from '@/lib/errors';
import { failure, validation } from '@/lib/errors';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';

/**
 * Who may be made a co-host (decision D1), in the reader's terms. Returned for
 * a stranger, for someone across a block (we don't say which), and when the
 * database's own check refuses a row this action let through.
 */
const NOT_ELIGIBLE =
  'You can only make a co-host of someone you’re connected with or who’s already invited to this plan.';

/**
 * Primary host adds a co-host by handle. Co-hosts share host powers (editing
 * the plan, approving join requests, confirming/cancelling). Only the primary
 * host can manage the co-host list — RLS enforces that on event_cohosts.
 *
 * Decision D1: the person must be one of the host's accepted connections or
 * already on this plan's guest list. Checked here first so the host gets a
 * sentence rather than a code, and again by the `event_cohosts_host` policy
 * (`private.cohost_eligible`), which is the rule that actually holds.
 */
export async function addCoHost(
  eventId: string,
  handle: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '');
  if (!cleanHandle) return validation('Enter a handle.');

  const [{ data: profile }, { data: event, error: eventError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('handle', cleanHandle)
      .maybeSingle(),
    supabase
      .from('events')
      .select('id, title, host_id, room_id')
      .eq('id', eventId)
      .maybeSingle(),
  ]);
  if (eventError) {
    return reportAndFail('SB-PLAN-SAVE', 'event.cohost-add', eventError, { eventId });
  }
  if (!event || event.host_id !== user.id) {
    return failure('SB-PERM-HOST', 'Only the host can add co-hosts.');
  }
  if (!profile) return validation('No one with that handle.');
  if (profile.id === user.id) {
    return validation('You’re already the host.');
  }

  // D1, read as the host: their own connection (caller-bound RPC, so it can
  // only ever answer about the caller), a block in either direction, and
  // whether the person already holds an invite to this plan (the host reads
  // every invite on their plan through `invites_select`).
  const [connected, blocked, invited] = await Promise.all([
    supabase.rpc('is_connected_with', { p_other: profile.id }),
    supabase.rpc('is_blocked_with', { p_other: profile.id }),
    supabase
      .from('invites')
      .select('id')
      .eq('event_id', eventId)
      .eq('invitee_id', profile.id)
      .neq('status', 'requested')
      .limit(1),
  ]);
  const lookupError = connected.error ?? blocked.error ?? invited.error;
  if (lookupError) {
    return reportAndFail('SB-PLAN-SAVE', 'event.cohost-add', lookupError, {
      eventId,
      step: 'eligibility',
    });
  }
  const eligible =
    !blocked.data && (Boolean(connected.data) || (invited.data ?? []).length > 0);
  if (!eligible) return validation(NOT_ELIGIBLE);

  const { error } = await supabase.from('event_cohosts').insert({
    event_id: eventId,
    cohost_id: profile.id,
    added_by: user.id,
  });
  if (error) {
    if (error.code === '23505') return validation('They’re already a co-host.');
    // The policy's WITH CHECK: eligibility changed between the read above and
    // the write (a block, a removed invite). Same answer, not an incident.
    if (error.code === '42501') return validation(NOT_ELIGIBLE);
    return reportAndFail('SB-PLAN-SAVE', 'event.cohost-add', error, { eventId });
  }

  // Handing someone the plan puts them down as going, if they hold an open
  // invitation: otherwise it sat unanswered and, on a timed line, lapsed to
  // "No response" while they were helping run it. The database applies the
  // RSVP's own rules (no seat on a guardian hold, none on a full plan), and
  // they can still change their answer on the plan. Best-effort: being a
  // co-host doesn't depend on it.
  const { data: rsvp, error: rsvpError } = await supabase.rpc('accept_cohost_invite', {
    p_event: eventId,
    p_cohost: profile.id,
  });
  if (rsvpError) {
    await reportOperationalError('event.cohost-add', rsvpError, { eventId, step: 'rsvp' });
  }
  const goingNow = rsvp === 'accepted';

  // Bring them into the Living Room so they can coordinate. Best-effort:
  // they may already be a member.
  if (event.room_id) {
    await supabase
      .from('room_members')
      .insert({ room_id: event.room_id, member_id: profile.id });
  }

  // Tell them. Being handed a plan's guest list and its cancel button is not
  // something to discover by accident, and the link is the way in: the plan
  // page now opens for a co-host whether or not they were invited.
  const { data: hostProfile } = await supabase
    .from('profiles')
    .select('display_name')
    .eq('id', user.id)
    .maybeSingle();
  await notifyUsers([profile.id], {
    kind: 'cohost_added',
    title: 'You’re co-hosting',
    body: `${hostProfile?.display_name?.trim() || 'The host'} made you a co-host of ${event.title}.${
      goingNow ? ' You’re down as going; change it on the plan if that’s wrong.' : ''
    }`,
    url: `/events/${eventId}`,
  });

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
  return { ok: true };
}

/**
 * Primary host takes someone off the co-host list. RLS on event_cohosts is the
 * gate; a write error is reported rather than dropped, so the panel can say the
 * co-host is still there instead of refreshing onto an unchanged list.
 */
export async function removeCoHost(
  eventId: string,
  cohostId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data: removed, error } = await supabase
    .from('event_cohosts')
    .delete()
    .eq('event_id', eventId)
    .eq('cohost_id', cohostId)
    .select('cohost_id');
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', error, {
      eventId,
      step: 'cohost-remove',
    });
  }
  // RLS filters a non-host's delete down to nothing without an error, which
  // used to read as success while the co-host stayed.
  if (!removed || removed.length === 0) {
    return failure('SB-PERM-HOST', 'Only the host can remove co-hosts.');
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath('/plans');
  return { ok: true };
}
