/**
 * The shape of an availability grid: which days, which bands, what they're
 * called.
 *
 * Pure and shared, because the server writes slots and the client renders them
 * and the two disagreeing about what "Tuesday evening" means is the kind of bug
 * that only shows up across a DST boundary, on someone else's phone.
 *
 * ————————————————————————— what a slot is —————————————————————————
 *
 * A slot is a *label*: a day on the plan's calendar and a band. It is spelled
 * as an ISO instant — the UTC calendar date is the plan's date, the UTC hour is
 * the band's `startHour` — because that is how every stored row, every poll
 * option made from the grid, and every reader (`option-label.ts`, the grid's
 * own cells) has always decoded it. "2026-10-02T17:00:00.000Z" means "Friday 2
 * October, evening, wherever the plan is", not 17:00 in Greenwich.
 *
 * Nothing that only needs the label may turn it into a clock time. The two
 * places that need a real instant — a calendar's busy blocks and the plan's
 * decided start — go through `slotRange` / `slotStartsAt` with the plan's zone,
 * and nowhere else. That was the bug this encoding used to have: the calendar
 * read the label as UTC, so "Fill from my calendar" marked the wrong bands for
 * anyone not on Greenwich time.
 */

import { busyGridSlots, type BusyInterval } from '@/lib/ics-busy';

/** Four bands a day rather than 24 hours. */
export interface Band {
  id: 'morning' | 'afternoon' | 'evening' | 'late';
  label: string;
  /** Hour the band starts, in the plan's own time zone. */
  startHour: number;
  /**
   * The start time a plan gets when this band wins a date poll (decision D5).
   * The band's start, except the evening: people mean six when they say "Friday
   * evening", not the five o'clock the band opens at to catch early finishers.
   */
  planHour: number;
  hint: string;
}

/**
 * 28 taps for a week is a decision someone finishes on a phone; 168 is a chore
 * they abandon. "Tuesday evening" is also the granularity people negotiate in —
 * nobody says they're free at 19:00 but not 20:00.
 */
export const BANDS: Band[] = [
  { id: 'morning', label: 'Morning', startHour: 8, planHour: 8, hint: '8am–12pm' },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, planHour: 12, hint: '12–5pm' },
  { id: 'evening', label: 'Evening', startHour: 17, planHour: 18, hint: '5–10pm' },
  { id: 'late', label: 'Late', startHour: 22, planHour: 22, hint: 'after 10pm' },
];

/** How many days forward the grid offers. */
export const GRID_DAYS = 7;

/** True when `zone` is an IANA name this runtime can compute with. */
function knownZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone a plan's grid is laid out in: the plan's own, or UTC when it has
 * none this runtime recognises. The client, the server action, and
 * `replace_event_availability` all resolve it the same way (the plan's
 * `time_zone`, else UTC), so the three agree on which week is on offer.
 */
export function planGridZone(zone: string | null | undefined): string {
  return knownZone(zone) ? zone : 'UTC';
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** What a clock in `zone` reads at `ms`. */
function wallClockAt(ms: number, zone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(ms));
  const at = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: at('year'),
    month: at('month'),
    day: at('day'),
    // Some ICU builds still spell midnight as 24.
    hour: at('hour') % 24,
    minute: at('minute'),
  };
}

/** How far `zone` is ahead of UTC at `ms`, to the minute. */
function zoneOffsetMs(ms: number, zone: string): number {
  const wall = wallClockAt(ms, zone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return asUtc - (ms - (ms % 60_000));
}

/**
 * A wall-clock reading in `zone` as a real instant (epoch ms).
 *
 * Two passes because the offset depends on the instant being looked for: the
 * reading taken as UTC is a usable guess, and re-reading the offset there
 * settles the hour a DST change would otherwise shift. Day overflow is fine
 * (`day + 1` on the 31st is the 1st of the next month), as with `Date.UTC`.
 */
export function wallClockInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string,
): number {
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  if (zone === 'UTC' || !knownZone(zone)) return naive;
  const first = zoneOffsetMs(naive, zone);
  const guess = naive - first;
  const second = zoneOffsetMs(guess, zone);
  return second === first ? guess : naive - second;
}

/**
 * The slots a grid covers: `days` calendar days starting from the day `from`
 * falls on in `zone`, four bands each.
 *
 * "Today" is the plan's today. A plan in New York opened at 9pm on a Tuesday
 * still offers Tuesday's late band, rather than starting on Wednesday because
 * Greenwich has already moved on. Everyone looking at one plan gets the same
 * grid, whatever their own clock says, which is what makes the counts
 * comparable.
 */
export function gridSlots(from: Date, days = GRID_DAYS, zone = 'UTC'): string[] {
  const today =
    zone === 'UTC'
      ? { year: from.getUTCFullYear(), month: from.getUTCMonth() + 1, day: from.getUTCDate() }
      : wallClockAt(from.getTime(), planGridZone(zone));
  const slots: string[] = [];
  for (let day = 0; day < days; day += 1) {
    for (const band of BANDS) {
      slots.push(
        new Date(Date.UTC(today.year, today.month - 1, today.day + day, band.startHour)).toISOString(),
      );
    }
  }
  return slots;
}

/** Whether a slot string is one this grid could have produced. */
export function isGridSlot(slot: string, from: Date, days = GRID_DAYS, zone = 'UTC'): boolean {
  return gridSlots(from, days, zone).includes(slot);
}

/** The label's parts, or null when the string is not a grid slot at all. */
function slotParts(slot: string): (Omit<WallClock, 'hour' | 'minute'> & { band: number }) | null {
  const date = new Date(slot);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCMinutes() !== 0 || date.getUTCSeconds() !== 0 || date.getUTCMilliseconds() !== 0) {
    return null;
  }
  const band = BANDS.findIndex((entry) => entry.startHour === date.getUTCHours());
  if (band === -1) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    band,
  };
}

/** A timestamp as PostgREST or `toISOString` spells it; nothing looser. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/;

/**
 * The canonical slot for a stored value, or null when it is not one.
 *
 * The same slot arrives spelled two ways — `toISOString()` in a poll option's
 * label, `2026-10-02T17:00:00+00:00` from PostgREST — and a string comparison
 * calls those different. Everything that matches a slot goes through here.
 */
export function parseGridSlot(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!ISO_INSTANT.test(trimmed)) return null;
  return slotParts(trimmed) ? new Date(trimmed).toISOString() : null;
}

/**
 * When a plan decided on this slot starts, in the plan's zone (decision D5):
 * the slot's day at its band's `planHour`. Null for anything that is not a
 * grid slot, which is what makes a free-text idea fall through to the host.
 */
export function slotStartsAt(slot: string, zone: string): string | null {
  const parts = slotParts(slot);
  if (!parts) return null;
  const { planHour } = BANDS[parts.band];
  return new Date(
    wallClockInstant(parts.year, parts.month, parts.day, planHour, 0, planGridZone(zone)),
  ).toISOString();
}

export interface SlotCount {
  slot: string;
  people: number;
  mine: boolean;
}

export interface AvailabilitySnapshot {
  counts: SlotCount[];
  /** People who pressed Save, including people who selected no slots. */
  responders: number;
  /** Signed-in people who can currently answer for this plan. */
  eligiblePeople: number;
}

export type RecommendationStatus = 'waiting' | 'provisional' | 'ready' | 'none';

export interface AvailabilityRecommendation {
  status: RecommendationStatus;
  slots: SlotCount[];
  responders: number;
  eligiblePeople: number;
  missing: number;
  message: string;
}

/**
 * The slots most people can make, best first.
 *
 * Ties break toward the earlier slot: given equal turnout, the sooner date is
 * the one a group is more likely to still be able to make.
 */
export function bestSlots(counts: SlotCount[], limit = 3): SlotCount[] {
  return [...counts]
    .filter((entry) => entry.people > 0)
    .sort(
      (a, b) =>
        b.people - a.people || new Date(a.slot).getTime() - new Date(b.slot).getTime(),
    )
    .slice(0, limit);
}

/**
 * How sociable a tied slot tends to be.
 *
 * Attendance always wins first. This score only breaks equal-count ties, so an
 * evening cannot displace a time that one more person can actually make. Within
 * a tie, evenings and weekends are less likely to turn "free" into an awkward
 * Tuesday-morning suggestion.
 */
function socialPreference(slot: string): number {
  const date = new Date(slot);
  const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
  const hour = date.getUTCHours();
  const band = hour === 17 ? 4 : hour === 12 ? 2 : hour === 22 ? 1 : 0;
  return band + (weekend ? 3 : 0);
}

function rankedSlots(
  counts: SlotCount[],
  limit: number,
  minimumPeople: number,
): SlotCount[] {
  return [...counts]
    .filter((entry) => entry.people >= minimumPeople)
    .sort(
      (a, b) =>
        b.people - a.people ||
        socialPreference(b.slot) - socialPreference(a.slot) ||
        new Date(a.slot).getTime() - new Date(b.slot).getTime(),
    )
    .slice(0, limit);
}

/**
 * The counts a recommendation may draw on: slots in this week's grid whose
 * decided start (`slotStartsAt`) is still ahead.
 *
 * Stored answers outlive the week they were given for, and a band that has
 * already begun cannot become the plan's date. The grid's "Best times" and
 * "Put the best times on the poll" both filter through here, so the button is
 * never enabled on a recommendation the server would then compute differently.
 */
export function upcomingSlotCounts(
  counts: SlotCount[],
  zone: string | null | undefined,
  now: Date = new Date(),
): SlotCount[] {
  const resolved = planGridZone(zone);
  const offered = new Set(gridSlots(now, GRID_DAYS, resolved));
  return counts.filter((entry) => {
    const slot = parseGridSlot(entry.slot);
    const startsAt = slot && offered.has(slot) ? slotStartsAt(slot, resolved) : null;
    return startsAt !== null && Date.parse(startsAt) > now.getTime();
  });
}

/**
 * Turn overlap into an answer without pretending missing responses are free.
 *
 * Fewer than 60% answered: wait; the sample is too thin to call anything a
 * recommendation. Partial but representative: show "best so far" and keep it
 * out of the poll. Everyone answered: the host can act on it. At every stage a
 * candidate also needs at least half of respondents (and two people in a real
 * group), otherwise saying "no good overlap" is more honest than choosing the
 * least-bad cell.
 */
export function recommendAvailability(
  snapshot: Pick<AvailabilitySnapshot, 'counts' | 'responders' | 'eligiblePeople'>,
  limit = 3,
): AvailabilityRecommendation {
  const responders = Math.max(0, Math.floor(snapshot.responders));
  // A stale aggregate should never make more respondents than eligible people.
  const eligiblePeople = Math.max(responders, Math.floor(snapshot.eligiblePeople));
  const missing = Math.max(0, eligiblePeople - responders);
  const participation = eligiblePeople > 0 ? responders / eligiblePeople : 0;

  if (responders === 0) {
    return {
      status: 'waiting',
      slots: [],
      responders,
      eligiblePeople,
      missing,
      message: 'Nobody has answered yet.',
    };
  }

  const minimumSample = Math.min(2, eligiblePeople);
  if (responders < minimumSample || participation < 0.6) {
    const neededToSuggest = Math.max(
      1,
      Math.max(minimumSample, Math.ceil(eligiblePeople * 0.6)) - responders,
    );
    return {
      status: 'waiting',
      slots: [],
      responders,
      eligiblePeople,
      missing,
      message: `Waiting for ${neededToSuggest} more ${neededToSuggest === 1 ? 'answer' : 'answers'} before suggesting a time.`,
    };
  }

  const neededForOverlap = responders === 1 ? 1 : Math.max(2, Math.ceil(responders / 2));
  const slots = rankedSlots(snapshot.counts, Math.max(1, limit), neededForOverlap);
  if (slots.length === 0) {
    return {
      status: 'none',
      slots: [],
      responders,
      eligiblePeople,
      missing,
      message:
        missing > 0
          ? `No good overlap yet. ${missing} ${missing === 1 ? 'person has' : 'people have'} not answered.`
          : 'There isn’t a good overlap in this week. Try another week or add new times.',
    };
  }

  if (missing > 0) {
    return {
      status: 'provisional',
      slots,
      responders,
      eligiblePeople,
      missing,
      message: `Best so far — ${responders} of ${eligiblePeople} people have answered.`,
    };
  }

  return {
    status: 'ready',
    slots,
    responders,
    eligiblePeople,
    missing,
    message: `Everyone has answered. These are the strongest overlaps.`,
  };
}

/**
 * How strongly to shade a cell: the share of the busiest slot, not of the
 * group.
 *
 * Relative, because the useful comparison is between slots. A plan where the
 * best anyone manages is three out of eight should still show that slot as the
 * clear winner rather than a washed-out third-full cell — the point is to find
 * the best time available, not to shame the group for being busy.
 */
export function heatLevel(people: number, busiest: number): 0 | 1 | 2 | 3 | 4 {
  if (people <= 0 || busiest <= 0) return 0;
  const share = people / busiest;
  if (share >= 1) return 4;
  if (share >= 0.66) return 3;
  if (share >= 0.33) return 2;
  return 1;
}

/**
 * The real instants a slot covers in the plan's zone: `[start, end)` in epoch
 * milliseconds.
 *
 * The bands tile the day, so a slot ends where the next one begins — and the
 * last band of the day runs until the first band of the next, which is what
 * makes "late" the ten-hour overnight stretch rather than a two-hour sliver.
 * Built from the zone's wall clock at both ends, so a band that spans a DST
 * change is the length the plan's clock says it is.
 *
 * Needed the moment anything outside the grid has to say whether it overlaps a
 * slot (a calendar's busy blocks, say). Deriving it here keeps that answer in
 * the same file as the band definitions, so the two cannot drift.
 */
export function slotRange(slot: string, zone = 'UTC'): { start: number; end: number } {
  const parts = slotParts(slot);
  if (!parts) {
    // Not a slot this grid produces. An hour is the least surprising answer,
    // and callers that care should be checking isGridSlot() first.
    const start = new Date(slot).getTime();
    return { start, end: start + 3_600_000 };
  }
  const resolved = planGridZone(zone);
  const next = parts.band === BANDS.length - 1
    ? { day: parts.day + 1, hour: BANDS[0].startHour }
    : { day: parts.day, hour: BANDS[parts.band + 1].startHour };
  return {
    start: wallClockInstant(parts.year, parts.month, parts.day, BANDS[parts.band].startHour, 0, resolved),
    end: wallClockInstant(parts.year, parts.month, next.day, next.hour, 0, resolved),
  };
}

// ————————————————————————— calendar busy time —————————————————————————

/**
 * The step a connected calendar's busy time is stored in.
 *
 * A person's busy time belongs to them, not to any one plan, so it cannot be
 * stored as grid slots: a band is only a band in a particular zone, and the
 * same person answers plans in different zones. Fifteen minutes is the
 * coarsest step every zone's band edges land on (India is +5:30, Nepal +5:45),
 * which is what lets one stored week serve every plan exactly. Still coarser
 * than the calendar it came from: no titles, no places, no minute-level edges.
 */
export const BUSY_STEP_MS = 15 * 60_000;

/**
 * The stretch of time a calendar read covers.
 *
 * Wide enough for any plan's seven-day grid in any zone: from the start of
 * yesterday (UTC) — the earliest a UTC+14 plan's "today" can begin — to ten
 * days on, past the last band of a UTC−12 plan's seventh day.
 */
export function calendarWindow(now: Date): { start: number; end: number } {
  const start =
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 24 * 3_600_000;
  return { start, end: start + 10 * 24 * 3_600_000 };
}

/**
 * The quarter-hours a set of busy intervals takes, as ISO instants.
 *
 * A quarter counts when more than half of it is taken, by the same rule
 * `busyGridSlots` applies to bands, so a five-minute call does not register
 * and a meeting's edges round to the nearest quarter rather than always
 * outward.
 */
export function busyQuarters(
  intervals: BusyInterval[],
  window: { start: number; end: number },
): string[] {
  const quarters: string[] = [];
  for (let at = window.start; at < window.end; at += BUSY_STEP_MS) {
    quarters.push(new Date(at).toISOString());
  }
  return busyGridSlots(intervals, quarters, (quarter) => {
    const start = Date.parse(quarter);
    return { start, end: start + BUSY_STEP_MS };
  });
}

/**
 * Which of a plan's grid slots a person's stored busy quarters take out.
 *
 * The quarters are real instants and the slots are labels, so this is the one
 * place they meet, through `slotRange` in the plan's zone. A band is busy when
 * more than half of it is taken, exactly as when the grid read a calendar
 * directly.
 */
export function busyBandsFromStored(
  stored: ReadonlyArray<string>,
  zone: string | null | undefined,
  now: Date = new Date(),
): string[] {
  const resolved = planGridZone(zone);
  const intervals: BusyInterval[] = [];
  for (const quarter of stored) {
    const start = Date.parse(quarter);
    if (Number.isFinite(start)) intervals.push({ start, end: start + BUSY_STEP_MS });
  }
  return busyGridSlots(intervals, gridSlots(now, GRID_DAYS, resolved), (slot) =>
    slotRange(slot, resolved),
  );
}
