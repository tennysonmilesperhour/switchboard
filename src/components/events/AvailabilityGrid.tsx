'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { setAvailability, slotsToPollOptions } from '@/lib/actions/availability';
import { BANDS, GRID_DAYS, gridSlots, heatLevel, type SlotCount } from '@/lib/availability';

interface AvailabilityGridProps {
  eventId: string;
  /** The plan's own zone, so everyone reads the same wall-clock time. */
  timeZone: string | null;
  counts: SlotCount[];
  isHost: boolean;
  /** The open poll to send the best slots to, when there is one. */
  pollId: string | null;
  /** Bands this person's connected calendar says are taken. */
  busySlots?: string[];
  /**
   * Whether the calendar is connected AND its last read succeeded. Connection
   * alone is not enough: a calendar that failed to read has no busy slots
   * stored, and filling from it would tick the entire week as free and tell the
   * group this person is available when nothing was ever checked. Being clear
   * all week is still a real answer, so this is gated on the read succeeding
   * rather than on the result being non-empty.
   */
  calendarUsable?: boolean;
  /**
   * The end of the week the last read covered. Slots past it were never looked
   * at, so filling leaves them alone instead of claiming them free.
   */
  coveredThrough?: string | null;
}

/** Background per heat level. Level 0 stays plain so "nobody" reads as empty. */
const HEAT = [
  'bg-paper border-line',
  'bg-sage-soft/40 border-sage-soft',
  'bg-sage-soft/70 border-sage-soft',
  'bg-sage/50 border-sage',
  'bg-sage/80 border-sage-deep',
] as const;

/**
 * When is everyone free?
 *
 * Picking a time is the first thing a group has to do and the thing that stalls
 * them longest — the date poll only helps once somebody has proposed dates, and
 * whoever proposes is guessing at everyone else's week.
 *
 * Your own marks are edited locally and saved in one go, because a grid is
 * filled in by tapping across it and a request per cell would be chatty and
 * half-applied the moment one failed.
 *
 * Nobody's individual availability is shown, including to the host — the group
 * sees counts. Same rule as poll votes, for the same reason: "who is free
 * Friday night" is a question about someone's private life.
 */
export function AvailabilityGrid({
  eventId,
  timeZone,
  counts,
  isHost,
  pollId,
  busySlots = [],
  calendarUsable = false,
  coveredThrough = null,
}: AvailabilityGridProps) {
  const slots = useMemo(() => gridSlots(new Date(), GRID_DAYS), []);
  const countBySlot = useMemo(() => {
    const map = new Map<string, SlotCount>();
    for (const entry of counts) map.set(entry.slot, entry);
    return map;
  }, [counts]);

  const [mine, setMine] = useState<Set<string>>(
    () => new Set(counts.filter((entry) => entry.mine).map((entry) => entry.slot)),
  );
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const busiest = useMemo(
    () => counts.reduce((most, entry) => Math.max(most, entry.people), 0),
    [counts],
  );

  const days = useMemo(() => {
    const seen: string[] = [];
    for (const slot of slots) {
      const day = slot.slice(0, 10);
      if (!seen.includes(day)) seen.push(day);
    }
    return seen;
  }, [slots]);

  /**
   * Fill the grid from the calendar: everything the week has room for.
   *
   * Offered rather than applied. A calendar knows when someone is occupied, not
   * when they want to go out — a free Tuesday morning is not an offer to meet
   * then — so this fills the board and leaves them to take things off it. Doing
   * it silently on load would put answers in the group's count that its owner
   * never gave, which is the one thing this grid has always refused to do.
   *
   * Two limits keep it from overclaiming. Days the last read never reached are
   * left untouched rather than ticked, because "not checked" is not "free". And
   * marks the person already made are theirs, so replacing them asks first.
   */
  async function fillFromCalendar() {
    const coverEnd = coveredThrough ? new Date(coveredThrough).getTime() : 0;
    const covered = slots.filter((slot) => new Date(slot).getTime() < coverEnd);
    if (covered.length === 0) {
      toast.error('Your calendar hasn’t been read for this week yet. Refresh it in Settings.');
      return;
    }

    if (mine.size > 0) {
      const ok = await confirm({
        title: 'Replace what you’ve marked?',
        body: 'Filling from your calendar starts again from what it says you have free. What you’ve ticked here will be replaced.',
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }

    const busy = new Set(busySlots);
    const free = covered.filter((slot) => !busy.has(slot));
    // Only the covered days are decided. Anything past the end of the read
    // stays exactly as the person left it.
    const kept = [...mine].filter((slot) => new Date(slot).getTime() >= coverEnd);
    setMine(new Set([...free, ...kept]));
    setDirty(true);
    toast.info(
      free.length === 0
        ? 'Your calendar has every one of those times taken. Tick anything that still works, then save.'
        : `Filled in ${free.length} free ${free.length === 1 ? 'time' : 'times'}. Take off any that don’t suit, then save.`,
    );
  }

  function toggle(slot: string) {
    setMine((current) => {
      const next = new Set(current);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
    setDirty(true);
  }

  function save() {
    startTransition(async () => {
      try {
        const result = await setAvailability(eventId, [...mine]);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not save that.', result.code);
          return;
        }
        setDirty(false);
        router.refresh();
      } catch {
        toast.error('Could not save when you’re free. Try again.');
      }
    });
  }

  function sendToPoll() {
    if (!pollId) return;
    startTransition(async () => {
      try {
        const result = await slotsToPollOptions(eventId, pollId);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not add those to the poll.', result.code);
          return;
        }
        toast.success(
          result.added === 0
            ? 'Those times are already on the poll.'
            : `Added ${result.added} time${result.added === 1 ? '' : 's'} to the poll.`,
        );
        router.refresh();
      } catch {
        toast.error('Could not add those to the poll. Try again.');
      }
    });
  }

  const dayLabel = (day: string) =>
    new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      timeZone: timeZone ?? undefined,
    });

  return (
    <section aria-labelledby="availability-heading">
      <SectionHeader
        title="When are you free?"
        hint="Tap the times that work. Everyone sees how many are free — never who."
      />

      <div className="overflow-x-auto">
        <table className="w-full min-w-[22rem] border-separate border-spacing-1">
          <caption className="sr-only">
            Availability for the next {GRID_DAYS} days, by day and time of day
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-16" />
              {days.map((day) => (
                <th
                  key={day}
                  scope="col"
                  className="text-[11px] font-bold text-ink-faint"
                >
                  {dayLabel(day)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BANDS.map((band) => (
              <tr key={band.id}>
                <th
                  scope="row"
                  className="text-left text-[11px] font-bold text-ink-faint"
                >
                  {band.label}
                  <span className="block font-normal text-ink-faint/70">{band.hint}</span>
                </th>
                {days.map((day) => {
                  const slot = slots.find(
                    (candidate) =>
                      candidate.slice(0, 10) === day &&
                      new Date(candidate).getUTCHours() === band.startHour,
                  );
                  if (!slot) return <td key={`${day}-${band.id}`} />;
                  const entry = countBySlot.get(slot);
                  // Your own pending taps count toward the shading you see, so
                  // the grid responds to you before the round trip lands.
                  const others = (entry?.people ?? 0) - (entry?.mine ? 1 : 0);
                  const people = others + (mine.has(slot) ? 1 : 0);
                  const picked = mine.has(slot);
                  return (
                    <td key={`${day}-${band.id}`}>
                      <button
                        type="button"
                        onClick={() => toggle(slot)}
                        aria-pressed={picked}
                        aria-label={`${dayLabel(day)} ${band.label}: ${people} free${
                          picked ? ', including you' : ''
                        }`}
                        className={`h-10 w-full rounded-lg border text-xs font-bold transition-colors ${
                          HEAT[heatLevel(people, Math.max(busiest, people))]
                        } ${picked ? 'ring-2 ring-terracotta' : ''}`}
                      >
                        {people > 0 ? people : ''}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {dirty ? 'Save when I’m free' : 'Saved'}
        </Button>
        {/* Only when a calendar is connected and actually read. Offering it
            otherwise is worse than not offering it: it would fill the week with
            free time nobody checked. */}
        {calendarUsable && (
          <Button size="sm" variant="secondary" onClick={fillFromCalendar} disabled={pending}>
            Fill from my calendar
          </Button>
        )}
        {isHost && pollId && (
          <Button size="sm" variant="secondary" onClick={sendToPoll} disabled={pending}>
            Put the best times on the poll
          </Button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-ink-faint">
        Counts include you. Nobody — the host included — can see which times any
        one person picked.
      </p>
    </section>
  );
}
