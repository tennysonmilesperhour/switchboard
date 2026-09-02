import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { normalizeWeight, scoreOptions, type Vote } from '@/lib/engine/scoring';
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

  const { data: opened } = await admin.rpc('resolve_poll_children', {
    p_poll: pollId,
  });
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
export async function resolvePoll(pollId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: poll } = await admin
    .from('polls')
    .select('id, resolution, phase')
    .eq('id', pollId)
    .single();
  if (!poll || poll.phase === 'decided') return;

  const [{ data: options }, { data: votes }] = await Promise.all([
    admin.from('poll_options').select('id').eq('poll_id', pollId),
    admin.from('poll_votes').select('option_id, voter_id, weight').eq('poll_id', pollId),
  ]);

  const engineVotes: Vote[] = (votes ?? []).map((v) => ({
    voterId: v.voter_id,
    optionId: v.option_id,
    weight: normalizeWeight(v.weight),
  }));
  const ranked = scoreOptions((options ?? []).map((o) => o.id), engineVotes);

  if (poll.resolution === 'auto' && ranked.length > 0) {
    await admin
      .from('polls')
      .update({ phase: 'decided', winning_option_id: ranked[0].optionId })
      .eq('id', pollId);
    await openFollowUpPolls(pollId);
    return;
  }

  if (poll.resolution === 'runoff' && poll.phase !== 'runoff' && ranked.length > 3) {
    const finalistIds = new Set(ranked.slice(0, 3).map((r) => r.optionId));
    const retired = (options ?? []).filter((o) => !finalistIds.has(o.id));
    if (retired.length > 0) {
      await admin.from('poll_options').delete().in('id', retired.map((o) => o.id));
    }
    await admin.from('poll_votes').delete().eq('poll_id', pollId);
    await admin.from('polls').update({ phase: 'runoff' }).eq('id', pollId);
    return;
  }

  // host_pick, a runoff that ran its course, or a tiny option set:
  // mark decided; the host picks from the finalists (or the auto winner
  // for a runoff is applied when they close it).
  if (poll.resolution === 'runoff' && poll.phase === 'runoff' && ranked.length > 0) {
    await admin
      .from('polls')
      .update({ phase: 'decided', winning_option_id: ranked[0].optionId })
      .eq('id', pollId);
    await openFollowUpPolls(pollId);
    return;
  }
  await admin.from('polls').update({ phase: 'decided' }).eq('id', pollId);
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
  const { data: closed } = await admin
    .from('polls')
    .update({ phase: 'voting' })
    .eq('phase', 'suggesting')
    .not('suggest_deadline', 'is', null)
    .lt('suggest_deadline', new Date().toISOString())
    .select('id');
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
  const { data: due } = await admin
    .from('polls')
    .select('id')
    .in('phase', ['suggesting', 'voting', 'runoff'])
    .not('vote_deadline', 'is', null)
    .lt('vote_deadline', new Date().toISOString());

  for (const poll of due ?? []) {
    await resolvePoll(poll.id);
  }
  return (due ?? []).length;
}
