/**
 * Standing rituals (completion plan P8, decision D8): the rules both Home and
 * Mutual use to say whether one is due, and the words the due-day reminder
 * uses. Pure, so it is safe in client components and tested without a
 * database.
 *
 * The schedule itself lives in `rituals.due_on`, moved only by the database
 * (20260930081000_ritual_reminders.sql): accepting makes the first one due
 * that day, planning one makes the next due a cadence later, and skipping
 * moves the date one cadence ahead.
 */

/** Today's date (`YYYY-MM-DD`) where this person is. An unknown zone reads as UTC. */
export function localDate(timeZone: string | null | undefined, now: Date = new Date()): string {
  const format = (zone: string) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  try {
    return format(timeZone || 'UTC');
  } catch {
    // `profiles.timezone` comes from a client form; Intl throws on a zone it
    // does not know, and one bad row must not take a page down.
    return format('UTC');
  }
}

export interface RitualSchedule {
  status: string;
  due_on: string | null;
}

/** Whether a ritual is due on `today` (a `YYYY-MM-DD` in the viewer's zone). */
export function ritualIsDue(ritual: RitualSchedule, today: string): boolean {
  return ritual.status === 'active' && Boolean(ritual.due_on) && (ritual.due_on as string) <= today;
}

/** "due now", "due tomorrow", "due Oct 21": when the next one is, from `today`. */
export function ritualDueLabel(dueOn: string, today: string): string {
  if (dueOn <= today) return 'due now';
  const day = (iso: string) => Date.parse(`${iso}T12:00:00Z`);
  if (Math.round((day(dueOn) - day(today)) / 86_400_000) === 1) return 'due tomorrow';
  const when = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(day(dueOn)));
  return `due ${when}`;
}

/** The due-day reminder, the same for both people. */
export function ritualReminderNotice(
  activity: string,
  otherName: string | null,
): { title: string; body: string; url: string } {
  const who = otherName?.trim() || 'your friend';
  return {
    title: 'A ritual is due',
    body: `Time for ${activity.toLowerCase()} with ${who}. Plan it, or skip this one.`,
    url: '/mutual',
  };
}
