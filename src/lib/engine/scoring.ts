/**
 * Anonymous Weighted Input scoring - pure functions.
 *
 * Weights: 2 = "Absolutely love this", 1 = "Sounds good",
 * 0 = neutral/unranked, -1 = "I'd rather not".
 * The goal is highest overall satisfaction, not raw vote counts:
 * ties break toward the least-objected option, then the most-loved.
 */

export type Weight = -1 | 0 | 1 | 2;

/** PostgreSQL exposes CHECK-constrained numeric columns as `number`. */
export function normalizeWeight(value: number): Weight {
  return value === -1 || value === 1 || value === 2 ? value : 0;
}

export interface Vote {
  voterId: string;
  optionId: string;
  weight: Weight;
}

/**
 * The weight a rating button should produce: tapping the weight you already
 * hold clears it back to neutral, tapping any other one moves you to it.
 *
 * Pulled out of the button handler because `current` is the part that goes
 * wrong. It has to be what the voter can *see* — the optimistic weight — and
 * not the server prop, which still holds the pre-tap value for as long as the
 * round trip takes. Computing the toggle from the prop meant a second tap
 * during that window re-sent the weight already on screen instead of clearing
 * it, so the button appeared to ignore the press.
 */
export function nextWeight(current: Weight, tapped: Weight): Weight {
  return current === tapped ? 0 : tapped;
}

export interface OptionScore {
  optionId: string;
  score: number;
  loves: number;
  objections: number;
  voters: number;
  /** 0-100: how satisfied the group would be with this option. */
  consensus: number;
}

export function scoreOptions(
  optionIds: readonly string[],
  votes: readonly Vote[],
): OptionScore[] {
  const byOption = new Map<string, Vote[]>(optionIds.map((id) => [id, []]));
  for (const vote of votes) {
    byOption.get(vote.optionId)?.push(vote);
  }

  const scores = optionIds.map((optionId) => {
    const optionVotes = byOption.get(optionId) ?? [];
    const score = optionVotes.reduce((sum, v) => sum + v.weight, 0);
    const loves = optionVotes.filter((v) => v.weight === 2).length;
    const objections = optionVotes.filter((v) => v.weight === -1).length;
    const voters = optionVotes.length;
    // Map mean weight from [-1, 2] onto [0, 100]; no votes → no consensus.
    const consensus =
      voters === 0 ? 0 : Math.round(((score / voters + 1) / 3) * 100);
    return { optionId, score, loves, objections, voters, consensus };
  });

  return scores.sort(
    (a, b) =>
      b.score - a.score ||
      a.objections - b.objections ||
      b.loves - a.loves ||
      a.optionId.localeCompare(b.optionId),
  );
}

/** Consensus of the current leader - powers the live consensus meter. */
export function groupConsensus(
  optionIds: readonly string[],
  votes: readonly Vote[],
): number {
  const [leader] = scoreOptions(optionIds, votes);
  return leader?.consensus ?? 0;
}

/** Top-N finalists for host pick or runoff survey. */
export function finalists(
  optionIds: readonly string[],
  votes: readonly Vote[],
  count = 3,
): OptionScore[] {
  return scoreOptions(optionIds, votes).slice(0, count);
}

/** What closing a poll does. */
export type PollOutcome =
  | { kind: 'winner'; optionId: string }
  | { kind: 'runoff'; finalistIds: string[] }
  | { kind: 'host_pick' };

/** How many finalists a runoff narrows to. */
export const RUNOFF_FINALISTS = 3;

/**
 * Decide what closing a poll does, from the ranking the votes produced.
 *
 * Two outcomes used to come out of nowhere. `scoreOptions` breaks its last tie
 * by option id, which is fine for ordering a list and wrong for choosing a
 * plan: with no votes at all, "Close voting & pick winner" crowned whichever
 * idea had the smallest UUID, and a runoff poll with more than three ideas
 * deleted all but three of them the same way — people's suggestions removed
 * on a coin flip nobody saw. So:
 *
 *   - no votes → the host picks (nothing to narrow, nothing to crown);
 *   - a leader that only leads on the id tiebreak → the host picks;
 *   - a runoff with nothing to narrow (three ideas or fewer) → the vote just
 *     cast *was* the final round, so its clear leader wins rather than the
 *     host being handed a decision they asked the group to make.
 */
export function decidePoll(input: {
  resolution: string;
  phase: string;
  ranked: readonly OptionScore[];
  voteCount: number;
}): PollOutcome {
  const { resolution, phase, ranked, voteCount } = input;
  if (voteCount === 0 || ranked.length === 0) return { kind: 'host_pick' };

  const clearLeader = (): PollOutcome => {
    const [first, second] = ranked;
    return second !== undefined && sameStanding(first, second)
      ? { kind: 'host_pick' }
      : { kind: 'winner', optionId: first.optionId };
  };

  if (resolution === 'auto') return clearLeader();
  if (resolution === 'runoff') {
    if (phase !== 'runoff' && ranked.length > RUNOFF_FINALISTS) {
      // Anything level with the last finalist goes through too: cutting an
      // idea that tied for third on its id is the coin flip this avoids.
      const cutoff = ranked[RUNOFF_FINALISTS - 1];
      const finalistIds = ranked
        .filter((r, index) => index < RUNOFF_FINALISTS || sameStanding(r, cutoff))
        .map((r) => r.optionId);
      if (finalistIds.length < ranked.length) return { kind: 'runoff', finalistIds };
    }
    return clearLeader();
  }
  return { kind: 'host_pick' };
}

/** Level on everything the ranking weighs, so only the id would separate them. */
function sameStanding(a: OptionScore, b: OptionScore): boolean {
  return a.score === b.score && a.objections === b.objections && a.loves === b.loves;
}

/** Whether closing this poll now narrows it to a runoff rather than deciding it. */
export function closesIntoRunoff(
  resolution: string,
  phase: string,
  optionCount: number,
): boolean {
  return resolution === 'runoff' && phase !== 'runoff' && optionCount > RUNOFF_FINALISTS;
}
