'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { SectionHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { setAvailability, slotsToPollOptions } from '@/lib/actions/availability';
import { syncCalendarForGrid } from '@/lib/actions/calendar-sync';
import {
  BANDS,
  GRID_DAYS,
  gridSlots,
  heatLevel,
  recommendAvailability,
  type SlotCount,
} from '@/lib/availability';

interface AvailabilityGridProps {
  eventId: string;
  /** The plan's own zone, so everyone reads the same wall-clock time. */
  timeZone: string | null;
  counts: SlotCount[];
  /** People who saved an answer, including an explicit empty answer. */
  responders: number;
  /** Signed-in people currently able to answer for this plan. */
  eligiblePeople: number;
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
  responders,
  eligiblePeople,
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

  const savedMine = useMemo(
    () => counts.filter((entry) => entry.mine).map((entry) => entry.slot),
    [counts],
  );
  const [mine, setMine] = useState<Set<string>>(() => new Set(savedMine));
  const [dirty, setDirty] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // The calendar as this component currently understands it. Seeded from the
  // server and replaced when the fill refreshes the feed itself, so one
  // interaction can re-read and fill without waiting for a re-render.
  const [busy, setBusy] = useState<string[]>(busySlots);
  const [coverEndsAt, setCoverEndsAt] = useState<string | null>(coveredThrough);
  // Follow the server when it genuinely changes — a sync from Settings, a
  // refresh — without discarding a read this component just did itself.
  // Adjusted during render rather than in an effect, so the fill never runs
  // against a window one paint out of date.
  const serverKey = `${coveredThrough ?? ''}|${busySlots.length}`;
  const [lastServerKey, setLastServerKey] = useState(serverKey);
  if (serverKey !== lastServerKey && !refreshing) {
    setLastServerKey(serverKey);
    setCoverEndsAt(coveredThrough);
    setBusy(busySlots);
  }
  // Set when the grid filled itself in, cleared the moment the person edits or
  // saves. Only ever describes marks that have not been sent anywhere.
  const [prefilled, setPrefilled] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  const busiest = useMemo(
    () => counts.reduce((most, entry) => Math.max(most, entry.people), 0),
    [counts],
  );
  const recommendation = useMemo(
    () => recommendAvailability({ counts, responders, eligiblePeople }),
    [counts, responders, eligiblePeople],
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
   * The slots the calendar has actually looked at, and the free ones among
   * them, for a given read window.
   *
   * Days past the end of the read are left out rather than counted free,
   * because "not checked" is not "free" — the distinction that keeps this from
   * telling a group someone is available on a week nobody read.
   */
  function freeWithin(coveredUntil: string | null, busyList: string[]) {
    const coverEnd = coveredUntil ? new Date(coveredUntil).getTime() : 0;
    const covered = slots.filter((slot) => new Date(slot).getTime() < coverEnd);
    const taken = new Set(busyList);
    return { coverEnd, covered, free: covered.filter((slot) => !taken.has(slot)) };
  }

  /**
   * Re-read the feed when the stored window no longer reaches this week.
   *
   * `covered_through` is fixed at sync time and nothing moves it on its own, so
   * a calendar connected a fortnight ago covers a fortnight ago. The button used
   * to give up here and name a different page; now it does the thing that page
   * would have done.
   */
  async function refreshCoverage(): Promise<{
    coveredThrough: string | null;
    busySlots: string[];
  } | null> {
    setRefreshing(true);
    try {
      const result = await syncCalendarForGrid();
      if (!result.ok) {
        toast.error(
          result.error ?? 'Could not read your calendar just now.',
          result.code,
        );
        return null;
      }
      const next = {
        coveredThrough: result.coveredThrough ?? null,
        busySlots: result.busySlots ?? [],
      };
      setCoverEndsAt(next.coveredThrough);
      setBusy(next.busySlots);
      return next;
    } catch {
      toast.error('Could not read your calendar just now. Try again.');
      return null;
    } finally {
      setRefreshing(false);
    }
  }

  /**
   * Fill the grid from the calendar: everything the week has room for.
   *
   * Offered rather than applied, and still never saved on the person's behalf.
   * A calendar knows when someone is occupied, not when they want to go out — a
   * free Tuesday morning is not an offer to meet then — so this fills the board
   * and leaves them to take things off it. Nothing reaches the group's counts
   * until they press save, which is the one thing this grid has always refused
   * to do without being asked.
   *
   * Marks the person already made are theirs, so replacing them asks first.
   */
  async function fillFromCalendar() {
    let window = freeWithin(coverEndsAt, busy);
    if (window.covered.length === 0) {
      const refreshed = await refreshCoverage();
      if (!refreshed) return;
      window = freeWithin(refreshed.coveredThrough, refreshed.busySlots);
      if (window.covered.length === 0) {
        toast.error(
          'Your calendar read fine but covers none of the next few days. Check the link in Settings.',
          'SB-CAL-READ',
        );
        return;
      }
    }

    if (mine.size > 0 && !prefilled) {
      const ok = await confirm({
        title: 'Replace what you’ve marked?',
        body: 'Filling from your calendar starts again from what it says you have free. What you’ve ticked here will be replaced.',
        confirmLabel: 'Replace',
      });
      if (!ok) return;
    }

    applyFill(window, true);
  }

  /** Put a computed fill on the board. Never saves; only the person does that. */
  function applyFill(
    window: ReturnType<typeof freeWithin>,
    announce: boolean,
  ) {
    // Only the covered days are decided. Anything past the end of the read
    // stays exactly as the person left it.
    const kept = savedMine.filter((slot) => new Date(slot).getTime() >= window.coverEnd);
    setMine(new Set([...window.free, ...kept]));
    setDirty(true);
    setPrefilled(true);
    if (!announce) return;
    toast.info(
      window.free.length === 0
        ? 'Your calendar has every one of those times taken. Tick anything that still works, then save.'
        : `Filled in ${window.free.length} free ${
            window.free.length === 1 ? 'time' : 'times'
          }. Take off any that don’t suit, then save.`,
    );
  }

  /**
   * "Is it possible for this to be automatic?" — yes, up to the point where it
   * would answer for her.
   *
   * Someone who has connected a calendar and not yet said anything about this
   * plan opens the grid already filled in, because the button they were meant
   * to find was a step they kept not getting past. What it does NOT do is save:
   * the marks sit there unsaved, labelled as a draft, and the group's counts
   * are unchanged until the save button is pressed. So the automatic part is
   * the typing, and the answer is still theirs.
   *
   * Runs once, and never over an existing answer — `savedMine.length > 0` means
   * they have already told the group something, and a calendar does not get to
   * revise it.
   */
  const autoFilled = useRef(false);
  useEffect(() => {
    if (autoFilled.current) return;
    if (!calendarUsable || savedMine.length > 0 || dirty) return;
    const window = freeWithin(coverEndsAt, busy);
    if (window.covered.length === 0 || window.free.length === 0) return;
    autoFilled.current = true;
    applyFill(window, false);
    // `applyFill` is recreated on every render and closes over state this effect
    // already lists; the ref is what makes it run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarUsable, savedMine.length, dirty, coverEndsAt, busy]);

  function toggle(slot: string) {
    setMine((current) => {
      const next = new Set(current);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
    setDirty(true);
    // Once they have touched it, it is their answer rather than a draft the
    // calendar wrote — so the banner goes and a later fill asks before replacing.
    setPrefilled(false);
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
        setPrefilled(false);
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

      <div className="mt-4 rounded-xl border border-line bg-cream/45 p-3" aria-live="polite">
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink-faint">
          {recommendation.status === 'provisional' ? 'Best times so far' : 'Best times'}
        </p>
        {recommendation.slots.length > 0 && (
          <ol className="mt-2 grid gap-1.5 sm:grid-cols-3">
            {recommendation.slots.map((entry) => {
              const band = BANDS.find(
                (candidate) => candidate.startHour === new Date(entry.slot).getUTCHours(),
              );
              return (
                <li key={entry.slot} className="rounded-lg bg-paper px-2.5 py-2 text-sm">
                  <span className="block font-bold text-ink">
                    {dayLabel(entry.slot.slice(0, 10))} {band?.label.toLowerCase()}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {entry.people} of {recommendation.responders} free
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        <p className="mt-2 text-xs text-ink-soft">{recommendation.message}</p>
      </div>

      {/* The line that keeps the automatic fill honest. Marks put there by the
          calendar are visibly a draft and visibly unsent, so nobody has to
          wonder whether the group has already been told something they did not
          say. */}
      {prefilled && (
        <p
          role="status"
          className="mt-3 rounded-card bg-gold-soft px-3 py-2 text-xs leading-snug text-ink"
        >
          <span className="font-bold">Filled in from your calendar.</span> Nobody
          can see any of this yet — take off anything that doesn’t suit, then
          save.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {dirty ? 'Save when I’m free' : 'Saved'}
        </Button>
        {/* Only when a calendar is connected and actually read. Offering it
            otherwise is worse than not offering it: it would fill the week with
            free time nobody checked. */}
        {calendarUsable && (
          <Button
            size="sm"
            variant="secondary"
            onClick={fillFromCalendar}
            disabled={pending || refreshing}
          >
            {refreshing ? 'Reading your calendar…' : 'Fill from my calendar'}
          </Button>
        )}
        {isHost && pollId && (
          <Button
            size="sm"
            variant="secondary"
            onClick={sendToPoll}
            disabled={pending || recommendation.status !== 'ready'}
          >
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
