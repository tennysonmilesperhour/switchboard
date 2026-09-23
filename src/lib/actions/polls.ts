'use server';

import type { ActionResult, ValidationFailure } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { requireUser } from '@/lib/server/require-user';
import type { createClient } from '@/lib/supabase/server';
import { isEventManager } from '@/lib/server/authz';
import { openFollowUpPolls, resolvePoll } from '@/lib/server/poll-runner';
import { notifySuggestionAdded } from '@/lib/server/notify';
import { failure, validation } from '@/lib/errors';
import { isOwnPublicStorageUrl } from '@/lib/server/media';
import { OPTION_LINK_MAX, duplicateIdea, prepareOptionFields } from '@/lib/poll-option-input';
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

/** Everything an idea may carry. Only the label is required. */
export interface SuggestionInput {
  label: string;
  detail?: string | null;
  linkUrl?: string | null;
  imageUrl?: string | null;
}

/**
 * The image must be one of our own public uploads (`/api/uploads/image`, the
 * `media` bucket). An arbitrary URL would let a card load a tracking pixel or
 * point at an attacker's host, and the upload route already applies the size
 * and type rules — so a pasted address is refused rather than stored.
 */
function preparedImage(raw: string | null | undefined): string | null | ValidationFailure {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) return null;
  if (trimmed.length > OPTION_LINK_MAX || !isOwnPublicStorageUrl(trimmed, ['media'])) {
    return validation('Photos need to be uploaded here, not pasted as a link.');
  }
  return trimmed;
}

/**
 * Refuse an idea already on the list. Two guests suggesting "Pizza" split the
 * votes that belong together, and can hand the win to something else. Read
 * through the caller's own client, so it only ever compares against options
 * they can already see.
 */
async function existingDuplicate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pollId: string,
  label: string,
  exceptId?: string,
): Promise<ValidationFailure | null> {
  const { data: options } = await supabase
    .from('poll_options')
    .select('id, label')
    .eq('poll_id', pollId);
  const match = duplicateIdea(label, options ?? [], exceptId);
  return match ? validation(`“${match.label}” is already on the list. Vote for it instead.`) : null;
}

export async function addSuggestion(
  pollId: string,
  eventId: string,
  input: SuggestionInput | string,
  detail?: string,
): Promise<SuggestionResult> {
  // Back-compat: a bare string is the label.
  const normalized: SuggestionInput =
    typeof input === 'string' ? { label: input, detail } : input;
  const prepared = prepareOptionFields(normalized);
  if (!prepared.ok) return validation(prepared.error);
  const imageUrl = preparedImage(normalized.imageUrl);
  if (imageUrl && typeof imageUrl === 'object') return imageUrl;

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { data: poll } = await supabase
    .from('polls')
    .select('phase, event_id, allow_suggestions')
    .eq('id', pollId)
    .single();
  if (!poll || poll.phase === 'decided') {
    return failure('SB-POLL-CLOSED', 'Voting has closed');
  }

  const isHost = await isEventManager(user.id, poll.event_id);
  if (!poll.allow_suggestions && !isHost) {
    return failure('SB-PERM-HOST', 'Only the host can add options');
  }

  const duplicate = await existingDuplicate(supabase, pollId, prepared.fields.label);
  if (duplicate) return duplicate;

  const { data: option, error } = await supabase
    .from('poll_options')
    .insert({
      poll_id: pollId,
      label: prepared.fields.label,
      detail: prepared.fields.detail,
      link_url: prepared.fields.linkUrl,
      image_url: imageUrl,
      author_id: user.id,
      source: isHost ? 'host' : 'guests',
    })
    .select('*')
    .single();
  if (error) return reportAndFail('SB-POLL-SUGGEST', 'poll.suggest', error, { pollId });

  // Tell the people who already ranked this poll that the list they ranked has
  // changed. Best-effort: the idea is saved either way.
  try {
    await notifySuggestionAdded(pollId, poll.event_id, prepared.fields.label, user.id);
  } catch (notifyError) {
    console.error('Suggestion notify failed', notifyError);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, option: option ?? undefined };
}

/**
 * Correct an idea: its wording, description, link, or photo.
 *
 * Who may is decided by the `poll_options_update` policy (the idea's author or
 * the plan's host, while the poll is open), so a refused edit comes back as
 * zero rows rather than an error. That is reported with a code that names both
 * conditions, because "nothing happened" is exactly the silence this app's
 * error rules exist to end. Votes already cast on the idea are untouched: a
 * spelling fix should not throw away the group's ranking.
 */
export async function updateSuggestion(
  pollId: string,
  eventId: string,
  optionId: string,
  input: SuggestionInput,
): Promise<SuggestionResult> {
  const prepared = prepareOptionFields(input);
  if (!prepared.ok) return validation(prepared.error);
  const imageUrl = preparedImage(input.imageUrl);
  if (imageUrl && typeof imageUrl === 'object') return imageUrl;

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const duplicate = await existingDuplicate(supabase, pollId, prepared.fields.label, optionId);
  if (duplicate) return duplicate;

  const { data: option, error } = await supabase
    .from('poll_options')
    .update({
      label: prepared.fields.label,
      detail: prepared.fields.detail,
      link_url: prepared.fields.linkUrl,
      image_url: imageUrl,
      updated_at: new Date().toISOString(),
    })
    .eq('id', optionId)
    .eq('poll_id', pollId)
    .select('*')
    .maybeSingle();
  if (error) return reportAndFail('SB-POLL-EDIT', 'poll.edit', error, { pollId, optionId });
  if (!option) return failure('SB-POLL-EDIT');

  revalidatePath(`/events/${eventId}`);
  return { ok: true, option };
}

/**
 * Take an idea off the list. Same gate as editing; the votes on it go with it
 * (the database cascades), and if it was the leader the meter simply moves to
 * the next idea.
 */
export async function deleteSuggestion(
  pollId: string,
  eventId: string,
  optionId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { data: removed, error } = await supabase
    .from('poll_options')
    .delete()
    .eq('id', optionId)
    .eq('poll_id', pollId)
    .select('id');
  if (error) return reportAndFail('SB-POLL-EDIT', 'poll.remove', error, { pollId, optionId });
  if (!removed || removed.length === 0) return failure('SB-POLL-EDIT');

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
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
    return validation('That option is not on this poll.');
  }
  const OPEN_PHASES = ['suggesting', 'voting', 'runoff'];
  if (!pollRow || !OPEN_PHASES.includes(pollRow.phase)) {
    return failure('SB-POLL-CLOSED', 'Voting is not open on this poll.');
  }

  const { error } = await supabase.from('poll_votes').upsert({
    poll_id: pollId,
    option_id: optionId,
    voter_id: user.id,
    weight,
    updated_at: new Date().toISOString(),
  });
  if (error) return reportAndFail('SB-PLAN-SAVE', 'poll.vote', error, { pollId, eventId });
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
  const auth = await requireUser();
  if (!auth.ok) return;
  const { supabase, user } = auth;
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
  const auth = await requireUser();
  if (!auth.ok) return;
  const { user } = auth;

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
  const auth = await requireUser();
  if (!auth.ok) return;
  const { supabase, user } = auth;
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
    return validation('That decision is not on this plan.');
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
