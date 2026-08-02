/**
 * Anonymous Weighted Input scoring - pure functions.
 *
 * Weights: 2 = "Absolutely love this", 1 = "Sounds good",
 * 0 = neutral/unranked, -1 = "I'd rather not".
 * The goal is highest overall satisfaction, not raw vote counts:
 * ties break toward the least-objected option, then the most-loved.
 */

export type Weight = -1 | 0 | 1 | 2;

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
