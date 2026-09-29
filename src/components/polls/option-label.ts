import { BANDS } from '@/lib/availability';
import { formatDate } from '@/lib/format';

/** Exactly what `slotsToPollOptions` stores: a grid slot's ISO instant. */
const GRID_SLOT_LABEL = /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/;

/**
 * How an idea's name reads on screen.
 *
 * "Put the best times on the poll" stores each time as its grid slot's ISO
 * instant, so a decided time stays machine-readable. Every surface printed the
 * label as-is, so the group was asked to rank "2026-10-02T17:00:00.000Z".
 *
 * A slot is a day plus a band key (see `gridSlots`), not a clock time, so it
 * reads the way the grid labels it: the day in the plan's zone and the band's
 * name. Converting the instant to a clock time would move "evening" to the
 * morning for anyone west of UTC. Anything else is the group's own words and
 * is returned untouched.
 */
export function pollOptionLabel(label: string, timeZone?: string | null): string {
  if (!GRID_SLOT_LABEL.test(label)) return label;
  const band = BANDS.find((entry) => entry.startHour === new Date(label).getUTCHours());
  if (!band) return label;
  return `${formatDate(`${label.slice(0, 10)}T12:00:00Z`, timeZone)} · ${band.label.toLowerCase()}`;
}
