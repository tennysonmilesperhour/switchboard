import type { InviteMode } from '@/lib/types';

/**
 * What a host may still change about the invitation line, and what to say when
 * the answer is "nothing".
 *
 * The client's report was one sentence: "Unable to reorder people in the
 * queue." The reorder control existed, and every reason she could not use it
 * was a condition spread across the view that rendered it:
 *
 *   * it was drawn only when **two or more** invites were still queued, so a
 *     host testing with two people (one asked, one waiting) saw no control at
 *     all — and no reason for its absence;
 *   * it was drawn only for `individual` plans, while the section above it
 *     promised "reorder or re-time anyone still in line" for every mode;
 *   * it was drawn only while the plan was `inviting`, so a plan still polling
 *     for its date — where nothing has been sent and the order is pure draft —
 *     offered nothing, even though the database happily accepts the move.
 *
 * So the decision lives here instead, once, and the surfaces ask. A row whose
 * order cannot change now says so; it does not quietly lose its buttons.
 */

/** The fields of an invite this module needs. Deliberately minimal. */
export interface LineInvite {
  id: string;
  status: string;
  position: number;
  /** Which wave they are in. Ignored outside `group` plans. */
  groupStage?: number;
}

/**
 * How many waves a plan may have. Five, because that is what the wizard has
 * always offered; `set_invite_stage` enforces the same ceiling, so the select
 * and the function cannot disagree about what exists.
 */
export const MAX_WAVES = 5;

/** Statuses a lapsed invite can be brought back from. */
const REOPENABLE: ReadonlySet<string> = new Set([
  'expired',
  'declined',
  'cancelled',
]);

/** What the host may do to one row, right now. */
export interface RowEdits {
  /**
   * Show the reorder pair at all. True for every queued row in a plan whose
   * line has an order, including the one row that cannot move yet: a disabled
   * control with a reason beside it beats a control that is not there.
   */
  reorderable: boolean;
  /** Enable "earlier" — somebody queued is ahead of them. */
  moveEarlier: boolean;
  /** Enable "later" — somebody queued is behind them. */
  moveLater: boolean;
  /**
   * Where they stand among the people still waiting, 1-based, or `null` when
   * the plan has no order to stand in. A host cannot correct an order she
   * cannot read, and "Waiting in line" said nothing about which line.
   */
  queuePlace: number | null;
  /**
   * Move them to another wave. The wave equivalent of reordering, and the only
   * order a `group` plan has: which stage goes out when.
   */
  restage: boolean;
  /** Change how long they get to answer (only before their invite goes out). */
  window: boolean;
  /** Put a lapsed invite back in the flow. */
  resend: boolean;
  /** Take them out of the flow. */
  remove: boolean;
}

export interface LineEditOptions {
  /** The plan's invite mode, straight from the row. */
  mode: InviteMode | string;
  /** False in a read-only view: not a host, or the guest list is settled. */
  editable: boolean;
}

/**
 * Does this plan have a one-by-one line whose order means anything?
 *
 * Only `individual` does. `group` asks a whole wave at a time and `all_at_once`
 * asks everybody, so in both there is no "next" to move somebody towards, and
 * the honest thing is to say that rather than draw arrows that swap two people
 * who are being asked in the same breath.
 */
export function lineHasOrder(mode: InviteMode | string): boolean {
  return mode === 'individual';
}

/** Does this plan go out in waves, so the order is "which wave"? */
export function lineHasWaves(mode: InviteMode | string): boolean {
  return mode === 'group';
}

/**
 * The waves a host may move somebody into, 0-based: every wave the plan already
 * has, plus the one after the last so a person can be pushed to the back —
 * capped at `MAX_WAVES`. Beyond that would leave a gap the cascade engine reads
 * as a stage that has resolved, so `set_invite_stage` refuses it too.
 */
export function wavesOffered(invites: readonly LineInvite[]): number[] {
  const highest = invites.reduce(
    (max, invite) => Math.max(max, invite.groupStage ?? 0),
    0,
  );
  const count = Math.min(highest + 2, MAX_WAVES);
  return Array.from({ length: count }, (_, stage) => stage);
}

/** The queued invites, in the order they will be asked. */
function queuedInOrder(invites: readonly LineInvite[]): LineInvite[] {
  return invites
    .filter((invite) => invite.status === 'queued')
    .sort((a, b) => a.position - b.position);
}

/** Everything the host may do to one row of the line. */
export function rowEdits(
  invite: LineInvite,
  invites: readonly LineInvite[],
  options: LineEditOptions,
): RowEdits {
  const queued = queuedInOrder(invites);
  const index = queued.findIndex((row) => row.id === invite.id);
  const isQueued = index >= 0;
  const reorderable = options.editable && isQueued && lineHasOrder(options.mode);
  return {
    reorderable,
    moveEarlier: reorderable && index > 0,
    moveLater: reorderable && index < queued.length - 1,
    queuePlace: isQueued && lineHasOrder(options.mode) ? index + 1 : null,
    restage: options.editable && isQueued && lineHasWaves(options.mode),
    window: options.editable && isQueued,
    resend: options.editable && REOPENABLE.has(invite.status),
    remove: options.editable && invite.status !== 'accepted',
  };
}

/** Does this row have any control to show? Decides whether to draw the strip. */
export function hasRowControls(edits: RowEdits): boolean {
  return (
    edits.reorderable ||
    edits.restage ||
    edits.window ||
    edits.resend ||
    edits.remove
  );
}

/**
 * The line under the list that explains why the order cannot be changed, or
 * `null` when the controls speak for themselves.
 *
 * This is the part that was missing. Every branch here used to be an absent
 * control, which reads as a broken one.
 */
export function lineOrderNotice(
  invites: readonly LineInvite[],
  options: LineEditOptions,
): string | null {
  if (!options.editable) return null;
  if (!lineHasOrder(options.mode)) {
    return lineHasWaves(options.mode)
      ? 'Waves go out in order, so the order here is which wave. Move anyone still waiting into an earlier wave to ask them sooner - a wave that has already gone out asks them within the minute.'
      : // Present tense on purpose: this same line is shown before the
        // invitations go out, while a date poll is still running.
        'Everyone is asked at the same time, so there is no order to change. You can still change how long anyone still waiting gets, or take them out.';
  }
  const queued = queuedInOrder(invites).length;
  if (queued === 0) {
    return 'Nobody is waiting in line, so there is no order left to change.';
  }
  if (queued === 1) {
    return 'Only one person is still in line, so there is nobody to swap them with. Add someone else and the order opens up again.';
  }
  return null;
}

export interface FlowHintOptions {
  editable: boolean;
  /** The plan is still polling for its date, so nothing has gone out yet. */
  deciding: boolean;
}

/**
 * The hint beside the section heading. It used to promise reordering in every
 * mode and every status, including the ones where no control was drawn.
 */
export function invitationFlowHint(
  mode: InviteMode | string,
  options: FlowHintOptions,
): string {
  if (options.deciding) {
    // Waves are an order too, so a wave plan gets the same invitation to sort
    // the line out now, while nothing has been sent.
    return options.editable && (lineHasOrder(mode) || lineHasWaves(mode))
      ? 'Only you see this - set the order now; invitations go out once the group has decided'
      : 'Only you see this - invitations go out once the group has decided';
  }
  if (!options.editable) {
    return 'Only you see this - the guest list is settled, so the flow is a record now';
  }
  if (lineHasOrder(mode)) {
    return 'Only you see this - reorder or re-time anyone still in line';
  }
  return lineHasWaves(mode)
    ? 'Only you see this - change the wave or the response window for anyone still in line'
    : 'Only you see this - everyone was asked at once; re-time or take out anyone still waiting';
}
