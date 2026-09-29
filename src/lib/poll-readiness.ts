/**
 * When a plan still deciding may send its invitations.
 *
 * Two things have to be true: the group has finished answering, and the plan
 * has a date. Invitations used to go out on the first alone, so a poll decided
 * on a free-text idea — or closed with nothing suggested — sent "The date is
 * set" for a plan still reading "Time TBD", with no calendar link and no
 * reminders.
 *
 * The plan page and `startInviting` both ask this module rather than each
 * re-deriving it, so a stale tab or a direct call cannot send invitations the
 * button would have refused. The page computes the polls' half on the server
 * (`readyToSendInvitations`) and HostControls combines it with the plan's
 * `starts_at` through `invitationStep`; `startInviting` makes the same two
 * calls on what it reads.
 */

/** A poll is being answered right now: open for suggestions, votes, or a runoff. */
function isOpen(phase: string): boolean {
  return phase !== 'decided' && phase !== 'pending';
}

/**
 * The polls' half of the rule: nothing is still being answered.
 *
 * A `pending` follow-up waits on its parent and opens by itself once the parent
 * is decided, at which point it is open and holds this back again. A plan with
 * no open poll at all — every poll decided, or none left — is settled: whether
 * it may send is then only a question of its date, which always has a route
 * out (the host sets one), where "wait for a decision nobody can make" had
 * none.
 */
export function readyToSendInvitations(polls: ReadonlyArray<{ phase: string }>): boolean {
  return !polls.some((poll) => isOpen(poll.phase));
}

/** Where a deciding plan stands on the way to sending its invitations. */
export type InvitationStep =
  /** A poll is still open. Wait for the group. */
  | 'deciding'
  /**
   * The group is done but the plan has no start time: a free-text idea won,
   * nothing won, or the winning time had already passed. The host sets it.
   */
  | 'needs-date'
  /** Decided and dated: "Send the invitations" is live. */
  | 'ready';

/**
 * The whole rule. `pollsSettled` is `readyToSendInvitations(polls)`; a decided
 * date poll whose winner was a grid time has already written `startsAt` by the
 * time this is asked (`applyDecidedDate`), so "a winner that set the date" and
 * "the plan has a date" are the same test.
 */
export function invitationStep(
  pollsSettled: boolean,
  startsAt: string | null | undefined,
): InvitationStep {
  if (!pollsSettled) return 'deciding';
  return startsAt && Number.isFinite(Date.parse(startsAt)) ? 'ready' : 'needs-date';
}
