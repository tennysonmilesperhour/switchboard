/**
 * Which step of the plan wizard you are allowed to move to, and by which route.
 *
 * The wizard is one client component holding every field in `useState`, so
 * moving between steps never costs anything — the only reason not to let
 * someone go somewhere is that the destination would not make sense yet.
 *
 * Backwards always makes sense. That is the whole point of a back control:
 * changing the date on Basics after seeing it on Review has to be possible
 * without abandoning the draft and starting the plan again.
 *
 * Forwards is the direction with a rule, and it is the same rule the Next
 * button already enforces one step at a time: you may skip ahead only across
 * steps that are finished. Otherwise tapping "Review" from Basics would land on
 * a summary of a plan with no title, and the wizard would have to explain a
 * state it should simply not have offered.
 */

/** Whether tapping step `target` should do anything, from step `current`. */
export function canJumpTo(
  target: number,
  current: number,
  /** Per-step: does this step have everything it needs? Same order as the steps. */
  complete: readonly boolean[],
): boolean {
  if (!Number.isInteger(target)) return false;
  if (target < 0 || target >= complete.length) return false;
  if (target === current) return false;
  if (target < current) return true;
  // Forwards: every step between here and there has to be finished, including
  // the one being left.
  return complete.slice(0, target).every(Boolean);
}

/**
 * The step a back gesture should land on: always the one before, never below
 * the first. Leaving the wizard entirely is what back does *at* the first step,
 * and that is the browser's job, not this one's.
 */
export function previousStep(current: number): number {
  return Math.max(0, current - 1);
}

/** The steps the plan wizard can show, in the order a person meets them. */
export type WizardStepKey =
  | 'basics'
  | 'people'
  | 'style'
  | 'order'
  | 'visibility'
  | 'review';

export const ALL_WIZARD_STEPS: readonly WizardStepKey[] = [
  'basics',
  'people',
  'style',
  'order',
  'visibility',
  'review',
];

/**
 * Whether "Set the order" has anything to decide. Everyone-at-once has no
 * order, and one person has nobody to be ahead of. The response window those
 * plans still need is asked on the invites step instead, so skipping this one
 * never hides a setting — it only drops a screen whose heading would be
 * telling the host to decide something that does not exist.
 */
export function orderStepNeeded(
  inviteMode: 'individual' | 'group' | 'all_at_once',
  inviteeCount: number,
): boolean {
  return inviteMode !== 'all_at_once' && inviteeCount > 1;
}

/** The steps this particular plan goes through, in order. */
export function wizardSteps(
  inviteMode: 'individual' | 'group' | 'all_at_once',
  inviteeCount: number,
): WizardStepKey[] {
  const needsOrder = orderStepNeeded(inviteMode, inviteeCount);
  return ALL_WIZARD_STEPS.filter((key) => key !== 'order' || needsOrder);
}
