/**
 * When a plan still deciding may send its invitations.
 *
 * The plan page disables "Send the invitations" until the group has finished
 * deciding, and `startInviting` refuses on the same rule, so a stale tab or a
 * direct call cannot send invitations for a date nobody has settled. Both ask
 * this module rather than each re-deriving it.
 */

/** A poll is being answered right now: open for suggestions, votes, or a runoff. */
function isOpen(phase: string): boolean {
  return phase !== 'decided' && phase !== 'pending';
}

/**
 * Nothing is still being answered, and at least one poll reached a decision.
 * A `pending` follow-up waits on its parent and opens by itself once the parent
 * is decided, at which point it is open and holds this back again.
 */
export function readyToSendInvitations(polls: ReadonlyArray<{ phase: string }>): boolean {
  return !polls.some((poll) => isOpen(poll.phase)) && polls.some((poll) => poll.phase === 'decided');
}
