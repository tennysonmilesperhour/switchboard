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
