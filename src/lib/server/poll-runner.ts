import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import {
  decidePoll,
  normalizeWeight,
  scoreOptions,
  type Vote,
} from '@/lib/engine/scoring';
import { pollQuestion } from '@/lib/types';

/**
 * Open any follow-up polls that were waiting on this one, and tell the group.
 *
 * Called after every path that can decide a poll — the host closing it, the
 * host picking a winner, and the deadline sweep — because a follow-up that only
 * opens when a human happens to press the right button is not a chain, it's a
 * chore. The unlock itself is one guarded statement in the database
 * (`resolve_poll_children`), so a re-run cannot reopen a poll that has already
 * moved on.
 */
export async function openFollowUpPolls(pollId: string): Promise<string[]> {
  const admin = createAdminClient();

  const { data: opened, error } = await admin.rpc('resolve_poll_children', {
    p_poll: pollId,
  });
  if (error) throw error;
  const ids = (opened ?? [])
    .map((row: { id?: string } | string) =>
      typeof row === 'string' ? row : row?.id,
    )
    .filter((id: string | undefined): id is string => Boolean(id));
  if (ids.length === 0) return [];

  // One notification per newly-open poll, to everyone who is in on the plan.
  // A decision landing is exactly the moment the next question becomes
  // answerable, so this is news, not noise — and it rides `notify_plans` like
  // every other plan update.
  for (const id of ids) {
    const { data: poll } = await admin
      .from('polls')
      .select('id, event_id, topic, title, event:events(title)')
      .eq('id', id)
      .maybeSingle();
    if (!poll) continue;

    const { data: invites } = await admin
      .from('invites')
      .select('invitee_id')
      .eq('event_id', poll.event_id)
      .eq('status', 'accepted');
    const { data: event } = await admin
      .from('events')
      .select('host_id, title')
      .eq('id', poll.event_id)
      .maybeSingle();

    const recipients = new Set<string>();
    for (const invite of invites ?? []) {
      if (invite.invitee_id) recipients.add(invite.invitee_id);
    }
    if (event?.host_id) recipients.add(event.host_id);
    if (recipients.size === 0) continue;

    await notifyUsers([...recipients], {
      kind: 'poll_opened',
      title: `That's settled — now: ${pollQuestion({
        topic: poll.topic,
        title: poll.title,
      })}`,
      body: event?.title ? `Weigh in on ${event.title}.` : 'Weigh in when you can.',
      url: `/events/${poll.event_id}`,
    });
  }

  return ids;
}

/**
 * Resolve a poll according to its resolution mode. Used by the host's
 * "close voting" action (after authz) and the cron deadline sweep.
 */
export async function resolvePoll(
  pollId: string,
  { onlyIfDue = false }: { onlyIfDue?: boolean } = {},
): Promise<void> {
  const admin = createAdminClient();

  const { data: poll, error: pollError } = await admin
    .from('polls')
    .select('id, resolution, phase, created_at, vote_deadline')
    .eq('id', pollId)
    .single();
  if (pollError) throw pollError;
  if (!poll || poll.phase === 'pending') return;
  if (poll.phase === 'decided') {
    // Retry an unlock that failed after the decision itself was saved.
    await openFollowUpPolls(pollId);
    return;
  }
  // Another worker may have opened a runoff after this sweep collected its
  // ids. Re-read the current deadline so that stale work cannot close it.
  if (onlyIfDue && (!poll.vote_deadline || Date.parse(poll.vote_deadline) > Date.now())) return;

  const [{ data: options, error: optionsError }, { data: votes, error: votesError }] = await Promise.all([
    admin.from('poll_options').select('id').eq('poll_id', pollId),
    admin.from('poll_votes').select('option_id, voter_id, weight').eq('poll_id', pollId),
  ]);
  // A failed read is not an empty ballot. Otherwise an outage decides the
  // poll without a winner and discards the group's chance to finish voting.
  if (optionsError) throw optionsError;
  if (votesError) throw votesError;

  const engineVotes: Vote[] = (votes ?? []).map((v) => ({
    voterId: v.voter_id,
    optionId: v.option_id,
    weight: normalizeWeight(v.weight),
  }));
  const ranked = scoreOptions((options ?? []).map((o) => o.id), engineVotes);
  const outcome = decidePoll({
    resolution: poll.resolution,
    phase: poll.phase,
    ranked,
    // A rating tapped twice is stored as a neutral 0, which says nothing.
    voteCount: engineVotes.filter((v) => v.weight !== 0).length,
  });

  if (outcome.kind === 'runoff') {
    // The first round's deadline has just expired. Give the final round the
    // same length as the first, starting now; retaining that expired instant
    // made the very next cron tick close the runoff with no new votes.
    // An untimed poll stays untimed and can still be closed by its host.
    const duration = poll.vote_deadline
      ? Date.parse(poll.vote_deadline) - Date.parse(poll.created_at)
      : null;
    if (duration !== null && (!Number.isFinite(duration) || duration <= 0)) {
      throw new Error('The voting deadline must be after the poll was created.');
    }
    const voteDeadline = duration === null ? null : new Date(Date.now() + duration).toISOString();
    const finalistIds = new Set(outcome.finalistIds);
    const retired = (options ?? []).filter((o) => !finalistIds.has(o.id));
    if (retired.length > 0) {
      const { error } = await admin.from('poll_options').delete().in('id', retired.map((o) => o.id));
      if (error) throw error;
    }
    const { error: deleteError } = await admin.from('poll_votes').delete().eq('poll_id', pollId);
    if (deleteError) throw deleteError;
    const { error: updateError } = await admin.from('polls')
      .update({ phase: 'runoff', vote_deadline: voteDeadline, allow_suggestions: false }).eq('id', pollId);
    if (updateError) throw updateError;
    return;
  }

  // A clear winner, or nothing that can honestly be called one - no votes, or a
  // leader only ahead on the id tiebreak - in which case the poll closes with
  // no winner and the host chooses from what the group said.
  const { error: updateError } = await admin
    .from('polls')
    .update({
      phase: 'decided',
      ...(outcome.kind === 'winner' ? { winning_option_id: outcome.optionId } : {}),
    })
    .eq('id', pollId);
  if (updateError) throw updateError;
  await openFollowUpPolls(pollId);
}

/**
 * Close suggestions on every poll whose suggest deadline has passed.
 *
 * The wizard has always collected this deadline and `create_event_atomic` has
 * always stored it, but nothing ever acted on it — a host who set "suggestions
 * close at 6pm" got nothing at 6pm. This performs the same transition the
 * host's own "Lock suggestions" button does, at the time they asked for.
 *
 * Only `suggesting` polls move, so a poll already in voting or runoff is
 * untouched, and the options collected so far are kept — locking suggestions
 * ends the brainstorm, it doesn't discard it.
 */
export async function sweepSuggestionDeadlines(): Promise<number> {
  const admin = createAdminClient();
  const { data: closed, error } = await admin
    .from('polls')
    .update({ phase: 'voting', allow_suggestions: false })
    .eq('phase', 'suggesting')
    .not('suggest_deadline', 'is', null)
    .lt('suggest_deadline', new Date().toISOString())
    .select('id');
  if (error) throw error;
  return (closed ?? []).length;
}

/**
 * Cron entrypoint: resolve every poll whose voting deadline has passed.
 *
 * `pending` is excluded on purpose — a follow-up's deadline shouldn't run down
 * while it is still waiting on the poll before it.
 */
export async function sweepDuePolls(): Promise<number> {
  const admin = createAdminClient();
  const { data: due, error } = await admin
    .from('polls')
    .select('id')
    .in('phase', ['suggesting', 'voting', 'runoff'])
    .not('vote_deadline', 'is', null)
    .lt('vote_deadline', new Date().toISOString());
  if (error) throw error;

  for (const poll of due ?? []) {
    await resolvePoll(poll.id, { onlyIfDue: true });
  }
  return (due ?? []).length;
}
