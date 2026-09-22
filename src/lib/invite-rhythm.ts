import type { InviteMode } from './types';

/**
 * When a plan's invitations actually go out, answered once.
 *
 * A host ended a round of feedback with "I'm a little nervous that they got
 * invited at once rather than the desired stagger." She was right that they
 * went at once — she had picked *Everyone at once* — and the app had spent
 * three screens telling her otherwise. The review step headed a list of five
 * identical timestamps with "here's how invitations will flow"; the plan page
 * offered to "reorder or re-time anyone still in line" over a line that did
 * not exist; the host view called itself the "Invitation flow" either way.
 *
 * None of those were lies anybody wrote on purpose. Each surface had worked
 * the mode out for itself, in its own words, and the ones that never thought
 * about `all_at_once` described the chain. So the question stops being asked
 * at call sites. There are two of them, and they are NOT the same question:
 *
 * - **`orderMatters`** — does a person's position in the list change what
 *   happens to them? Only in a one-at-a-time chain. This is what a drag
 *   handle, a position number, and "who gets asked first" are gated on.
 * - **`isStaggered`** — do invitations leave at different moments? True for a
 *   chain and for waves, false for everyone-at-once. This is what a send time,
 *   a countdown, and "the flow stops when someone accepts" are gated on.
 *
 * Waves are the case that makes the distinction worth having: they go out at
 * different times, so the times are real and worth showing, but which wave
 * somebody is in is a dropdown on their row, not where they sit in the list.
 */

/**
 * Read a stored `invite_mode` as one this application understands.
 *
 * The column is a CHECK-constrained `text`, so a row can outlive the deploy
 * that wrote it. Falling back to everyone-at-once is the fail-closed choice:
 * it promises the host nothing — no order, no line, no stagger — where the
 * alternative would draw a drag handle over invitations this build does not
 * know the rules for. Same posture as `normalizeInviteStatus`.
 */
export function asInviteMode(value: string): InviteMode {
  return value === 'individual' || value === 'group' ? value : 'all_at_once';
}

/** Does a person's place in the list decide anything about their invitation? */
export function orderMatters(mode: InviteMode): boolean {
  return mode === 'individual';
}

/** Do these invitations leave at different moments? */
export function isStaggered(mode: InviteMode): boolean {
  return mode !== 'all_at_once';
}

/**
 * What to tell the host about the timing, in her own plan's terms.
 *
 * Plain and unhedged in the simultaneous case especially, because that is the
 * one she could not confirm from anything on screen.
 */
export function rhythmLine(mode: InviteMode, inviteeCount: number): string {
  const people = `${inviteeCount} invitation${inviteeCount === 1 ? '' : 's'}`;
  switch (mode) {
    case 'all_at_once':
      return `All ${people} go out the moment you send - there is no order and nobody is kept waiting.`;
    case 'individual':
      return 'One person is asked at a time, in the order below. The moment someone accepts, the rest are never asked.';
    case 'group':
      return 'Invitations go out wave by wave. A later wave is only asked if spots are still open.';
  }
}

/**
 * What the host's own list of invitations is called on the plan page.
 *
 * "Invitation flow" over five rows that all say "Invited" is the heading that
 * started this; a plan with no flow gets a heading that does not claim one.
 */
export function inviteListTitle(mode: InviteMode): string {
  return isStaggered(mode) ? 'Invitation flow' : 'Who this went to';
}

/** The line under that heading. */
export function inviteListHint(mode: InviteMode): string {
  return isStaggered(mode)
    ? 'Only you see this - reorder or re-time anyone still in line'
    : 'Only you see this - everyone was invited at the same moment';
}
