/**
 * The reflection deck: past plans, one swipe each.
 *
 * Pure rules shared by the server loader, the save action and the card UI, so
 * the three cannot disagree about what counts as "over", what a swipe means, or
 * which detail tags exist.
 */

export type DeckVerdict = 'loved' | 'liked' | 'disliked' | 'missed';

export const DECK_VERDICTS: readonly DeckVerdict[] = ['loved', 'liked', 'disliked', 'missed'];

export type SwipeDirection = 'up' | 'right' | 'left' | 'down';

/** Swipe up = really loved, right = liked, left = didn't like, down = didn't go. */
export const SWIPE_VERDICT: Record<SwipeDirection, DeckVerdict> = {
  up: 'loved',
  right: 'liked',
  left: 'disliked',
  down: 'missed',
};

export const VERDICT_LABEL: Record<DeckVerdict, string> = {
  loved: 'Loved it',
  liked: 'Liked it',
  disliked: 'Not for me',
  missed: 'Didn’t go',
};

/**
 * Preset details a person can tick before they swipe. Keys are what is stored,
 * so they are permanent; labels can change.
 */
export const DECK_TAGS: readonly { key: string; label: string }[] = [
  { key: 'great-people', label: 'Great people' },
  { key: 'good-food', label: 'Good food' },
  { key: 'good-music', label: 'Good music' },
  { key: 'felt-like-me', label: 'Felt like me' },
  { key: 'learned-something', label: 'Learned something' },
  { key: 'would-repeat', label: 'Would do again' },
  { key: 'too-crowded', label: 'Too crowded' },
  { key: 'too-loud', label: 'Too loud' },
  { key: 'ran-long', label: 'Ran long' },
  { key: 'awkward', label: 'Awkward' },
  { key: 'too-tired', label: 'Too tired' },
  { key: 'ran-out-of-time', label: 'Ran out of time' },
];

export const DECK_TAG_KEYS: ReadonlySet<string> = new Set(DECK_TAGS.map((t) => t.key));

export const JOURNAL_MAX = 2000;

const DAY_MS = 86_400_000;

/** A plan is offered a day after it ends, or sooner if it was marked over. */
export function isReflectable(
  event: {
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    happened_at: string | null;
  },
  nowMs: number,
): boolean {
  if (event.status === 'cancelled' || event.status === 'draft') return false;
  if (event.happened_at || event.status === 'past') return true;
  const over = event.ends_at ?? event.starts_at;
  if (!over) return false;
  const t = new Date(over).getTime();
  return Number.isFinite(t) && nowMs - t >= DAY_MS;
}

/** Keep only known tags, once each, in the order the card shows them. */
export function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const picked = new Set(input.filter((t): t is string => typeof t === 'string'));
  return DECK_TAGS.map((t) => t.key).filter((key) => picked.has(key));
}

/**
 * Which way a drag went, or null if it has not travelled far enough to count.
 * The longer axis wins so a diagonal flick still reads as one decision.
 */
export function swipeDirection(dx: number, dy: number, threshold = 90): SwipeDirection | null {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (Math.max(ax, ay) < threshold) return null;
  if (ax >= ay) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down';
}

/** The feeling a verdict implies for the energy map; "didn't go" implies none. */
export function impliedFeeling(verdict: DeckVerdict): 'filled' | 'drained' | null {
  if (verdict === 'loved' || verdict === 'liked') return 'filled';
  if (verdict === 'disliked') return 'drained';
  return null;
}
