/**
 * Smart response-window suggestions: the closer the event, the shorter
 * the window, so cascades resolve before the moment passes.
 */

const MINUTE = 1;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

interface WindowRule {
  maxLeadMinutes: number;
  windowMinutes: number;
  label: string;
}

const RULES: WindowRule[] = [
  { maxLeadMinutes: 3 * HOUR, windowMinutes: 15, label: '15 minutes' },
  { maxLeadMinutes: 24 * HOUR, windowMinutes: HOUR, label: '1 hour' },
  { maxLeadMinutes: 3 * DAY, windowMinutes: 4 * HOUR, label: '4 hours' },
  { maxLeadMinutes: 7 * DAY, windowMinutes: DAY, label: '1 day' },
  { maxLeadMinutes: 30 * DAY, windowMinutes: 3 * DAY, label: '3 days' },
];
const FALLBACK: WindowRule = {
  maxLeadMinutes: Number.POSITIVE_INFINITY,
  windowMinutes: 7 * DAY,
  label: '1 week',
};

export const WINDOW_CHOICES = [
  { windowMinutes: 15, label: '15 minutes' },
  { windowMinutes: 30, label: '30 minutes' },
  { windowMinutes: HOUR, label: '1 hour' },
  { windowMinutes: 4 * HOUR, label: '4 hours' },
  { windowMinutes: DAY, label: '1 day' },
  { windowMinutes: 3 * DAY, label: '3 days' },
  { windowMinutes: 7 * DAY, label: '1 week' },
] as const;

/**
 * A host's tempo, used by the opt-in "Tune my defaults" operator setting to
 * nudge suggested windows to their revealed pace. 'snappy' shortens the default
 * one rung, 'relaxed' lengthens it one rung, 'standard' leaves it untouched.
 */
export type WindowPace = 'snappy' | 'standard' | 'relaxed';

export function suggestWindow(
  eventStart: Date,
  now: Date,
  pace: WindowPace = 'standard',
): {
  windowMinutes: number;
  label: string;
} {
  const leadMinutes = Math.max(
    0,
    (eventStart.getTime() - now.getTime()) / 60_000,
  );
  const rule = RULES.find((r) => leadMinutes <= r.maxLeadMinutes) ?? FALLBACK;
  if (pace === 'standard') {
    return { windowMinutes: rule.windowMinutes, label: rule.label };
  }
  // Shift the base suggestion one rung along the choice ladder toward the
  // host's tempo, clamped to the ends.
  let idx = WINDOW_CHOICES.findIndex(
    (c) => c.windowMinutes >= rule.windowMinutes,
  );
  if (idx < 0) idx = WINDOW_CHOICES.length - 1;
  const shifted = Math.min(
    WINDOW_CHOICES.length - 1,
    Math.max(0, idx + (pace === 'snappy' ? -1 : 1)),
  );
  return {
    windowMinutes: WINDOW_CHOICES[shifted].windowMinutes,
    label: WINDOW_CHOICES[shifted].label,
  };
}

/**
 * Infer a host's pace from the response windows they've actually chosen on
 * recent plans (their revealed preference). A median at or below 30 minutes
 * reads as snappy; at or above a day reads as relaxed; anything between is
 * standard. Returns 'standard' when there isn't enough history to be fair.
 */
export function paceFromChosenWindows(windowMinutes: number[]): WindowPace {
  if (windowMinutes.length < 3) return 'standard';
  const sorted = [...windowMinutes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  if (median <= 30) return 'snappy';
  if (median >= DAY) return 'relaxed';
  return 'standard';
}

/**
 * The response window a set of invitees share, or null when they differ.
 *
 * Backs the wizard's "Everyone gets ..." control. Derived from the rows on
 * every render rather than stored alongside them, so the control cannot claim
 * a window the list has since moved away from: change one person by hand and
 * this reports null ("Mixed"), which is what actually happened.
 *
 * An empty list has no shared window rather than a default one — there is no
 * "everyone" to speak for yet, and answering 0 invitees with a number would put
 * a confident value in a control that governs nobody.
 */
export function sharedWindow(windowMinutes: number[]): number | null {
  if (windowMinutes.length === 0) return null;
  const [first] = windowMinutes;
  return windowMinutes.every((m) => m === first) ? first : null;
}

/**
 * The window to give someone added to an existing list.
 *
 * Inherits the shared window when there is one, so "everyone gets a day"
 * survives adding a sixth person; falls back to the suggestion only when the
 * list has no single answer to inherit. Without this, the select-all control
 * would be quietly undone by the next guest, and the host would have no reason
 * to re-check a row they had already set.
 */
export function windowForNewInvitee(
  windowMinutes: number[],
  suggestedMinutes: number,
): number {
  return sharedWindow(windowMinutes) ?? suggestedMinutes;
}
