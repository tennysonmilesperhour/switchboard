/**
 * When a plan ends, given the day it starts and two clock times.
 *
 * The wizard asks for an end *time*, not an end date, because nearly every plan
 * ends the day it starts. The one common exception is the one a social app
 * cannot get wrong: a party from 9 PM to 1 AM, a show that lets out after
 * midnight, a night out. Read literally, "1:00 AM" on the start date is twenty
 * hours *before* 9 PM, so the wizard used to refuse it with "End time should be
 * after the start time" and there was no way to make a late-night plan at all.
 *
 * With only a time to go on, an end at or before the start can only mean the
 * next day. So it does, and the wizard says so. The single ambiguous case is an
 * end equal to the start — zero hours or twenty-four — which is refused rather
 * than guessed.
 */

export interface PlanEnd {
  /** ISO timestamp of the end, or null when there is no end time. */
  endsAt: string | null;
  /** The end rolled past midnight onto the following day. */
  nextDay: boolean;
  /** The end is the same clock time as the start: refused, not guessed. */
  sameAsStart: boolean;
}

const NO_END: PlanEnd = { endsAt: null, nextDay: false, sameAsStart: false };

/**
 * @param date      `YYYY-MM-DD` the plan starts on, in the host's zone.
 * @param startTime `HH:MM` (24h) the plan starts.
 * @param endTime   `HH:MM` (24h) the plan ends, or '' for no end time.
 */
export function planEnd(date: string, startTime: string, endTime: string): PlanEnd {
  if (!date || !endTime) return NO_END;
  const end = new Date(`${date}T${endTime}`);
  if (Number.isNaN(end.getTime())) return NO_END;
  // `HH:MM` zero-padded 24h strings order the same way the times do.
  if (endTime === startTime) {
    return { endsAt: end.toISOString(), nextDay: false, sameAsStart: true };
  }
  if (endTime > startTime) {
    return { endsAt: end.toISOString(), nextDay: false, sameAsStart: false };
  }
  // Calendar-day arithmetic rather than +24h, so a night that crosses a
  // daylight-saving change still ends at the clock time the host picked.
  end.setDate(end.getDate() + 1);
  return { endsAt: end.toISOString(), nextDay: true, sameAsStart: false };
}

/**
 * Whether two timestamps name the same moment.
 *
 * Never compare timestamps as strings. The same instant comes back from
 * PostgREST as `2026-09-25T02:00:00+00:00` and out of `toISOString()` as
 * `2026-09-25T02:00:00.000Z`; a string test calls those different, and the plan
 * editor used exactly that test to decide whether to tell every accepted guest
 * the time had changed.
 */
export function sameInstant(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (Number.isNaN(left) || Number.isNaN(right)) return a === b;
  return left === right;
}
