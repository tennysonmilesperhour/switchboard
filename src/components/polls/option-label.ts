import { BANDS, parseGridSlot } from '@/lib/availability';
import { formatDate } from '@/lib/format';

/**
 * How an idea's name reads on screen.
 *
 * "Put the best times on the poll" stores each time as its grid slot's ISO
 * instant, so a decided time stays machine-readable. Every surface printed the
 * label as-is, so the group was asked to rank "2026-10-02T17:00:00.000Z".
 *
 * A slot is a day plus a band key (see `gridSlots`), not a clock time, so it
 * reads the way the grid labels it: the slot's own day and the band's name.
 * The day is printed as written rather than converted into the plan's zone —
 * it already is the plan's day, and converting noon UTC moved it a day on for
 * plans east of UTC+12. Converting the instant to a clock time would move
 * "evening" to the morning for anyone west of UTC. Anything else is the
 * group's own words and is returned untouched.
 *
 * `timeZone` is accepted so callers can pass the plan's zone without caring
 * whether the label is a slot; a slot's label does not depend on it.
 */
export function pollOptionLabel(label: string, timeZone?: string | null): string {
  void timeZone;
  const slot = parseGridSlot(label);
  if (!slot) return label;
  const band = BANDS.find((entry) => entry.startHour === new Date(slot).getUTCHours());
  if (!band) return label;
  return `${formatDate(`${slot.slice(0, 10)}T12:00:00Z`, 'UTC')} · ${band.label.toLowerCase()}`;
}

/**
 * An idea's description, or null when there is nothing a person wrote there.
 *
 * Options made from the grid carry their slot in `detail` as well, so the
 * plan's date can be set from it even if the label is reworded. That copy is
 * for the machine; shown under the winner it read "2026-10-02T17:00:00+00:00".
 */
export function pollOptionDetail(detail: string | null | undefined): string | null {
  const trimmed = detail?.trim();
  if (!trimmed || parseGridSlot(trimmed)) return null;
  return trimmed;
}

/**
 * The line under a poll's question.
 *
 * A poll that closed with nothing on it used to tell the host "choose the
 * winner below" over an empty list — the one state with no way forward. It now
 * says what is true: there is nothing to choose, so the host settles it
 * directly, and for a date that is what the plan's "Set the date" step is for.
 */
export function pollHint({
  phase,
  decided,
  isHost,
  ideas,
}: {
  phase: string;
  /** The poll has a winner. */
  decided: boolean;
  isHost: boolean;
  ideas: number;
}): string {
  if (phase === 'decided') {
    if (decided) return 'The group has decided.';
    if (ideas === 0) {
      return isHost
        ? 'Voting closed with no ideas on the list, so there is nothing to choose. Settle it yourself in Edit plan.'
        : 'Voting closed with no ideas on the list. The host will settle it.';
    }
    return isHost
      ? 'Voting is closed - choose the winner below.'
      : 'Voting is closed - the host is choosing.';
  }
  if (phase === 'runoff') return 'Final runoff - pick between the finalists.';
  return 'Rank ideas privately. Nobody sees your individual votes.';
}
