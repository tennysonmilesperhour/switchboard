import { createAdminClient } from '@/lib/supabase/admin';
import { scoreOptions, type Vote, type Weight } from '@/lib/engine/scoring';

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
    weight: v.weight as Weight,
  }));
  const ranked = scoreOptions((options ?? []).map((o) => o.id), engineVotes);

  if (poll.resolution === 'auto' && ranked.length > 0) {
    await admin
      .from('polls')
      .update({ phase: 'decided', winning_option_id: ranked[0].optionId })
      .eq('id', pollId);
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
    return;
  }
  await admin.from('polls').update({ phase: 'decided' }).eq('id', pollId);
}

/** Cron entrypoint: resolve every poll whose voting deadline has passed. */
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
