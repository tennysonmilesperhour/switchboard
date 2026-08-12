'use server';

import type { ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { isEventManager } from '@/lib/server/authz';
import { openFollowUpPolls, resolvePoll } from '@/lib/server/poll-runner';
import { notifySuggestionAdded } from '@/lib/server/notify';
import { failure } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';
import { capture } from '@/lib/analytics/server';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import type { Weight } from '@/lib/engine/scoring';
import type { PollOption, PollTopic } from '@/lib/types';

/**
 * The saved row comes back with the result.
 *
 * The client cannot learn about its own write from a re-render it does not
 * control. `revalidatePath` + `router.refresh()` were both firing and the RSC
 * refetches were returning 200 without the new option, while a full page load
 * showed it immediately — so the idea sat invisible until something else
 * happened to reload the page. Handing the row back closes that gap with the
 * one fact the server already has, and it carries the real id, so the option
 * can be voted on the moment it appears.
 */
export type SuggestionResult = ActionResult & { option?: PollOption };

export async function addSuggestion(
  pollId: string,
  eventId: string,
  label: string,
  detail?: string,
): Promise<SuggestionResult> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: 'Suggestion is empty' };

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: poll } = await supabase
    .from('polls')
    .select('phase, event_id, allow_suggestions')
    .eq('id', pollId)
    .single();
  if (!poll || poll.phase === 'decided') {
    return { ok: false, error: 'Voting has closed' };
  }

  const isHost = await isEventManager(user.id, poll.event_id);
  if (!poll.allow_suggestions && !isHost) {
    return { ok: false, error: 'Only the host can add options' };
  }

  const { data: option, error } = await supabase
    .from('poll_options')
    .insert({
      poll_id: pollId,
      label: trimmed,
      detail: detail?.trim() || null,
      source: isHost ? 'host' : 'guests',
    })
    .select('*')
    .single<PollOption>();
  if (error) return { ok: false, error: error.message };

  // Tell the people who already ranked this poll that the list they ranked has
  // changed. Best-effort: the idea is saved either way.
  try {
    await notifySuggestionAdded(pollId, poll.event_id, trimmed, user.id);
  } catch (notifyError) {
    console.error('Suggestion notify failed', notifyError);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, option: option ?? undefined };
}

export async function castVote(
  pollId: string,
  eventId: string,
  optionId: string,
  weight: Weight,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Only accept a ballot for an option that actually belongs to this poll, and
  // only while the poll is open to input — don't trust the client-supplied
  // optionId/phase. The combined suggest-and-rank screen (PollSection's
  // `votingOpen`) lets members weigh options during `suggesting` and `runoff`
  // as well as `voting`, so accept a ballot in any of those; only a `decided`
  // poll is closed.
  //
  // Both checks gate the same write and neither feeds the other, so they go out
  // together. They used to run back to back, which put three sequential round
  // trips between a tap and the button changing — voting is the one action
  // people fire off in bursts, so that latency is the whole experience.
  const [{ data: option }, { data: pollRow }] = await Promise.all([
    supabase.from('poll_options').select('poll_id').eq('id', optionId).maybeSingle(),
    supabase.from('polls').select('phase').eq('id', pollId).maybeSingle(),
  ]);
  if (!option || option.poll_id !== pollId) {
    return { ok: false, error: 'That option is not on this poll.' };
  }
  const OPEN_PHASES = ['suggesting', 'voting', 'runoff'];
  if (!pollRow || !OPEN_PHASES.includes(pollRow.phase)) {
    return { ok: false, error: 'Voting is not open on this poll.' };
  }

  const { error } = await supabase.from('poll_votes').upsert({
    poll_id: pollId,
    option_id: optionId,
    voter_id: user.id,
    weight,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  // The event only, never the weight or option — individual votes stay private.
  //
  // Scheduled after the response rather than awaited: capture() allows itself up
  // to two seconds before giving up, and awaiting that on a button people tap
  // repeatedly handed the whole of it to the person voting. Analytics is a
  // bonus, never a blocker, so it must not sit on this path.
  after(() => capture(user.id, ANALYTICS_EVENTS.pollVoted, { event_id: eventId }));
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

export async function openVoting(pollId: string, eventId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Host/co-host only (parity with closeVoting); RLS also enforces this, but
  // check here so a non-host gets a clean no-op rather than relying on it.
  const isHost = await isEventManager(user.id, eventId);
  if (!isHost) return;
  await supabase.from('polls').update({ phase: 'voting' }).eq('id', pollId);
  revalidatePath(`/events/${eventId}`);
}

/**
 * Close voting. Depending on the poll's resolution mode this either
 * auto-picks the winner, hands the host the finalists, or opens a runoff.
 * Host-only; the actual resolution logic is shared with the cron sweep.
 */
export async function closeVoting(pollId: string, eventId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Co-hosts share host powers (is_event_host covers both).
  const isHost = await isEventManager(user.id, eventId);
  if (!isHost) return;

  await resolvePoll(pollId);
  revalidatePath(`/events/${eventId}`);
}

export async function pickWinner(
  pollId: string,
  eventId: string,
  optionId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Host/co-host only (parity with closeVoting); RLS also enforces this.
  const isHost = await isEventManager(user.id, eventId);
  if (!isHost) return;
  await supabase
    .from('polls')
    .update({ phase: 'decided', winning_option_id: optionId })
    .eq('id', pollId);
  // A host picking the winner decides the poll just as much as the runner
  // does, so the follow-ups have to open from here too — otherwise a chain
  // stalls silently for every host who uses the pick-the-winner path.
  await openFollowUpPolls(pollId);
  revalidatePath(`/events/${eventId}`);
}

/**
 * Add a follow-up poll: the question that only becomes answerable once this
 * one lands.
 *
 * Created `pending`, so it is set up but not yet asked. The database opens it
 * when the parent is decided; nothing here or in the client advances a phase.
 */
export async function addFollowUpPoll(
  parentPollId: string,
  eventId: string,
  topic: PollTopic,
  title?: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await isEventManager(user.id, eventId))) {
    return failure('SB-PLAN-ACCESS');
  }

  const { data: parent } = await supabase
    .from('polls')
    .select('id, event_id, resolution, allow_suggestions')
    .eq('id', parentPollId)
    .maybeSingle();
  if (!parent || parent.event_id !== eventId) {
    return { ok: false, error: 'That decision is not on this plan.' };
  }

  const { error } = await supabase.from('polls').insert({
    event_id: eventId,
    parent_poll_id: parentPollId,
    topic,
    title: title?.trim() ? title.trim().slice(0, 120) : null,
    // A follow-up inherits how the parent decides things: a host who set the
    // first question to resolve itself doesn't want to be asked again.
    resolution: parent.resolution,
    allow_suggestions: parent.allow_suggestions,
    phase: 'pending',
  });
  if (error) return reportAndFail('SB-PLAN-SAVE', 'poll.follow-up', error);

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/** Remove a follow-up that hasn't opened yet. Host/co-host only. */
export async function removeFollowUpPoll(
  pollId: string,
  eventId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await isEventManager(user.id, eventId))) {
    return failure('SB-PLAN-ACCESS');
  }

  // Only while still pending: once a poll has opened, people may have answered
  // it, and deleting it would take their input with it.
  const { error } = await supabase
    .from('polls')
    .delete()
    .eq('id', pollId)
    .eq('phase', 'pending');
  if (error) return reportAndFail('SB-PLAN-SAVE', 'poll.follow-up-remove', error);

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
