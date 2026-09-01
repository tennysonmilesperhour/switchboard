/**
 * The shape of an availability grid: which days, which bands, what they're
 * called.
 *
 * Pure and shared, because the server writes slots and the client renders them
 * and the two disagreeing about what "Tuesday evening" means is the kind of bug
 * that only shows up across a DST boundary, on someone else's phone.
 */

/** Four bands a day rather than 24 hours. */
export interface Band {
  id: 'morning' | 'afternoon' | 'evening' | 'late';
  label: string;
  /** Hour the band starts, in the plan's own time zone. */
  startHour: number;
  hint: string;
}

/**
 * 28 taps for a week is a decision someone finishes on a phone; 168 is a chore
 * they abandon. "Tuesday evening" is also the granularity people negotiate in —
 * nobody says they're free at 19:00 but not 20:00.
 */
export const BANDS: Band[] = [
  { id: 'morning', label: 'Morning', startHour: 8, hint: '8am–12pm' },
  { id: 'afternoon', label: 'Afternoon', startHour: 12, hint: '12–5pm' },
  { id: 'evening', label: 'Evening', startHour: 17, hint: '5–10pm' },
  { id: 'late', label: 'Late', startHour: 22, hint: 'after 10pm' },
];

/** How many days forward the grid offers. */
export const GRID_DAYS = 7;

/**
 * The slot instants a grid covers, starting from `from`.
 *
 * Built in UTC from the calendar date so the set is stable regardless of where
 * the caller is standing: a plan's grid is the same grid for everyone looking
 * at it, which is what makes the counts comparable. Rendering into the plan's
 * own zone is the display layer's job.
 */
export function gridSlots(from: Date, days = GRID_DAYS): string[] {
  const slots: string[] = [];
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  for (let day = 0; day < days; day += 1) {
    for (const band of BANDS) {
      const slot = new Date(start);
      slot.setUTCDate(start.getUTCDate() + day);
      slot.setUTCHours(band.startHour, 0, 0, 0);
      slots.push(slot.toISOString());
    }
  }
  return slots;
}

/** Whether a slot string is one this grid could have produced. */
export function isGridSlot(slot: string, from: Date, days = GRID_DAYS): boolean {
  return gridSlots(from, days).includes(slot);
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
 * The instants a slot covers: `[start, end)` in epoch milliseconds.
 *
 * The bands tile the day, so a slot ends where the next one begins — and the
 * last band of the day runs until the first band of the next, which is what
 * makes "late" the ten-hour overnight stretch rather than a two-hour sliver.
 *
 * Needed the moment anything outside the grid has to say whether it overlaps a
 * slot (a calendar's busy blocks, say). Deriving it here keeps that answer in
 * the same file as the band definitions, so the two cannot drift.
 */
export function slotRange(slot: string): { start: number; end: number } {
  const start = new Date(slot);
  const index = BANDS.findIndex((band) => band.startHour === start.getUTCHours());
  const end = new Date(start);
  if (index === -1) {
    // Not a slot this grid produces. An hour is the least surprising answer,
    // and callers that care should be checking isGridSlot() first.
    end.setUTCHours(start.getUTCHours() + 1);
  } else if (index === BANDS.length - 1) {
    end.setUTCDate(start.getUTCDate() + 1);
    end.setUTCHours(BANDS[0].startHour, 0, 0, 0);
  } else {
    end.setUTCHours(BANDS[index + 1].startHour, 0, 0, 0);
  }
  return { start: start.getTime(), end: end.getTime() };
}
