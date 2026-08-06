/**
 * The clock the plan wizard offers, in five-minute steps.
 *
 * `<input type="time">` looks like the right control until you use it on a
 * phone: iOS renders a minute-by-minute wheel and ignores `step`, so a host
 * aiming for 5:20 lands on 5:19 and has to nudge the wheel back. The values
 * here are the same `HH:MM` strings a time input produces — only the choosing
 * changes, so everything downstream (`date + time` → `starts_at`) is untouched.
 *
 * Labels are built by hand rather than with `Intl` so a server render and the
 * client render can't disagree about the viewer's locale mid-hydration.
 */

export const TIME_STEP_MINUTES = 5;

const MINUTES_PER_DAY = 24 * 60;

/** Accepts what a time input emits ("09:05") and what parsers emit ("9:05"). */
const CLOCK = /^(\d{1,2}):([0-5]\d)$/;

export type TimeOption = { value: string; label: string };

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** "17:20" → 1040. Null when the string isn't a wall-clock time. */
export function clockToMinutes(value: string): number | null {
  const match = CLOCK.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23) return null;
  return hour * 60 + Number(match[2]);
}

/** 1040 → "17:20", wrapping so arithmetic on a clock stays on the clock. */
export function minutesToClock(minutes: number): string {
  const wrapped = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

/** "17:20" → "5:20 PM". Returns '' for anything that isn't a time. */
export function formatClock(value: string): string {
  const minutes = clockToMinutes(value);
  if (minutes === null) return '';
  const hour24 = Math.floor(minutes / 60);
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minutes % 60)} ${hour24 < 12 ? 'AM' : 'PM'}`;
}

/**
 * Every five-minute slot in the day, midnight first.
 *
 * `keep` is the value already in the field. A plan imported from a link or
 * dictated aloud can carry an off-grid time ("18:47"); dropping it would leave
 * the control looking empty and quietly change the plan when the host next
 * touches an unrelated field, so it's offered alongside the grid, in place.
 */
export function timeOptions(keep?: string | null): TimeOption[] {
  const options: TimeOption[] = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += TIME_STEP_MINUTES) {
    options.push({ value: minutesToClock(minutes), label: formatClock(minutesToClock(minutes)) });
  }
  const extra = keep ? clockToMinutes(keep) : null;
  if (extra === null || extra % TIME_STEP_MINUTES === 0) return options;
  const value = minutesToClock(extra);
  options.splice(Math.ceil(extra / TIME_STEP_MINUTES), 0, {
    value,
    label: formatClock(value),
  });
  return options;
}
