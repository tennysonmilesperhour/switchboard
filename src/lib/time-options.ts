/**
 * The clock the plan wizard offers, split the way people say a time.
 *
 * `<input type="time">` looks like the right control until you use it on a
 * phone: iOS renders a minute-by-minute wheel and ignores `step`, so a host
 * aiming for 5:20 lands on 5:19 and has to nudge the wheel back. The first fix
 * was one `<select>` holding every five-minute slot in the day — correct
 * detents, but 288 of them, so picking 7:30pm meant scrolling past ninety
 * entries. Both controls make you travel through times you don't want to reach
 * the one you do.
 *
 * So the day is offered the way it is spoken instead: an hour, a minute, and
 * AM or PM. Twelve hours and twelve minutes are each a short list, and the half
 * of the day is one tap rather than a hundred rows of scrolling. The values
 * here are still the `HH:MM` strings a time input produces — only the choosing
 * changes, so everything downstream (`date + time` -> `starts_at`) is untouched.
 *
 * Labels are built by hand rather than with `Intl` so a server render and the
 * client render can't disagree about the viewer's locale mid-hydration.
 */

export const TIME_STEP_MINUTES = 5;

const MINUTES_PER_DAY = 24 * 60;

/** Accepts what a time input emits ("09:05") and what parsers emit ("9:05"). */
const CLOCK = /^(\d{1,2}):([0-5]\d)$/;

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

/** Which half of the day a time falls in. */
export type Meridiem = 'AM' | 'PM';

/** A wall-clock time as it is spoken: "6", "47", "PM". */
export interface ClockParts {
  /** 1-12, the way a clock face is numbered — never 0, never 13. */
  hour12: number;
  minute: number;
  meridiem: Meridiem;
}

/**
 * The hour column, in the order the day runs.
 *
 * 12 leads rather than 1 because 12 AM is midnight and 12 PM is noon: pairing
 * the column with AM then reading downward gives midnight, 1am, 2am, in order.
 * Starting at 1 would put midnight at the bottom of the morning.
 */
export const HOUR_CHOICES: readonly number[] = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export const MERIDIEMS: readonly Meridiem[] = ['AM', 'PM'];

/**
 * The minute column: every five-minute step of the hour.
 *
 * `keep` is the minute already in the field. A plan imported from a link or
 * dictated aloud can carry an off-grid time ("18:47"); dropping it would leave
 * the control showing a time the plan does not have, and would quietly
 * reschedule it the next time the host touched an unrelated field. So it is
 * offered alongside the grid, in its own place in the order.
 */
export function minuteChoices(keep?: number | null): number[] {
  const choices: number[] = [];
  for (let minute = 0; minute < 60; minute += TIME_STEP_MINUTES) choices.push(minute);
  if (keep === null || keep === undefined) return choices;
  if (!Number.isInteger(keep) || keep < 0 || keep > 59) return choices;
  if (keep % TIME_STEP_MINUTES === 0) return choices;
  choices.splice(Math.ceil(keep / TIME_STEP_MINUTES), 0, keep);
  return choices;
}

/**
 * "18:47" -> `{ hour12: 6, minute: 47, meridiem: 'PM' }`.
 *
 * Null when the string isn't a wall-clock time, which is also how an empty
 * field arrives — the caller renders its "nothing chosen" state rather than
 * inventing a time nobody picked.
 */
export function splitClock(value: string): ClockParts | null {
  const minutes = clockToMinutes(value);
  if (minutes === null) return null;
  const hour24 = Math.floor(minutes / 60);
  return {
    hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: minutes % 60,
    meridiem: hour24 < 12 ? 'AM' : 'PM',
  };
}

/**
 * `{ hour12: 6, minute: 47, meridiem: 'PM' }` -> "18:47".
 *
 * The inverse of `splitClock` on every value the pickers can produce. Hours
 * outside 1-12 are wrapped onto the clock rather than rejected, so arithmetic
 * on an hour column can't produce an impossible time.
 */
export function joinClock({ hour12, minute, meridiem }: ClockParts): string {
  const onFace = ((Math.round(hour12) % 12) + 12) % 12;
  const hour24 = meridiem === 'PM' ? onFace + 12 : onFace;
  return minutesToClock(hour24 * 60 + minute);
}
