/**
 * Recurring plans: a host picks how often a plan repeats when they create it.
 * We don't auto-spawn occurrences on a schedule — instead the plan carries its
 * cadence, and once it's behind them the host taps "Schedule the next one",
 * which clones the crew forward to the next date this math produces. Pure so it
 * can be unit-tested and shared between the wizard, the event page, and the
 * server action.
 */

export type RecurrenceKind =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'custom';

export interface RecurrenceChoice {
  kind: RecurrenceKind;
  label: string;
}

/** Order shown in the "Repeats" picker. */
export const RECURRENCE_CHOICES: RecurrenceChoice[] = [
  { kind: 'none', label: 'Doesn’t repeat' },
  { kind: 'daily', label: 'Daily' },
  { kind: 'weekly', label: 'Weekly' },
  { kind: 'biweekly', label: 'Every 2 weeks' },
  { kind: 'monthly', label: 'Monthly' },
  { kind: 'custom', label: 'Custom…' },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Cadences whose step is a fixed number of days. Monthly is calendar-aware. */
const FIXED_INTERVAL_DAYS: Partial<Record<RecurrenceKind, number>> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
};

/** Custom cadence in days must land in this inclusive range (matches the DB check). */
export const MIN_CUSTOM_DAYS = 1;
export const MAX_CUSTOM_DAYS = 365;

/** Coerce/clamp a custom day count to the permitted range, or null if unusable. */
export function normalizeCustomInterval(
  value: number | null | undefined,
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < MIN_CUSTOM_DAYS) return null;
  return Math.min(rounded, MAX_CUSTOM_DAYS);
}

/** Human label for a badge, e.g. "Repeats weekly". Null when it doesn't repeat. */
export function recurrenceLabel(
  kind: RecurrenceKind,
  intervalDays?: number | null,
): string | null {
  switch (kind) {
    case 'none':
      return null;
    case 'daily':
      return 'Repeats daily';
    case 'weekly':
      return 'Repeats weekly';
    case 'biweekly':
      return 'Repeats every 2 weeks';
    case 'monthly':
      return 'Repeats monthly';
    case 'custom': {
      const days = normalizeCustomInterval(intervalDays);
      if (!days) return 'Repeats';
      if (days === 1) return 'Repeats daily';
      if (days === 7) return 'Repeats weekly';
      return `Repeats every ${days} days`;
    }
  }
}

/** Add whole calendar months, clamping the day so Jan 31 + 1mo → Feb 28/29. */
function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const shifted = new Date(date.getTime());
  shifted.setUTCDate(1);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 0),
  ).getUTCDate();
  shifted.setUTCDate(Math.min(day, lastDay));
  return shifted;
}

/** The single next occurrence after `from`, or null if the plan doesn't repeat. */
export function nextOccurrence(
  from: Date,
  kind: RecurrenceKind,
  intervalDays?: number | null,
): Date | null {
  if (kind === 'none') return null;
  if (kind === 'monthly') return addMonths(from, 1);
  const days =
    kind === 'custom'
      ? normalizeCustomInterval(intervalDays)
      : FIXED_INTERVAL_DAYS[kind] ?? null;
  if (!days) return null;
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * The first occurrence strictly after `after`, rolling forward from `from` as
 * many steps as needed. Used by "Schedule the next one" so a plan that already
 * happened lands on the upcoming slot, not a date in the past.
 */
export function nextOccurrenceAfter(
  from: Date,
  kind: RecurrenceKind,
  intervalDays: number | null | undefined,
  after: Date,
): Date | null {
  let next = nextOccurrence(from, kind, intervalDays);
  if (!next) return null;
  // Guard bounds the loop well past any realistic gap (≈10 years of weekly).
  for (let guard = 0; next.getTime() <= after.getTime() && guard < 520; guard++) {
    const step = nextOccurrence(next, kind, intervalDays);
    if (!step) break;
    next = step;
  }
  return next;
}
