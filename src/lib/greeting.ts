/**
 * "Good morning" is a claim about the reader's clock, not the server's.
 *
 * Home is a server component, so `new Date().getHours()` there reads the
 * *runtime* zone — UTC on Vercel — and greeted a tester at 9am Pacific with
 * "Good afternoon" (16:00Z). The hour must always be resolved in a named zone
 * belonging to the person reading it: their browser's zone when we have it,
 * their stored `profiles.timezone` when we're rendering ahead of the browser.
 */

export type Greeting = 'Good morning' | 'Good afternoon' | 'Good evening';

/**
 * The wall-clock hour (0–23) of `date` in `timeZone`.
 *
 * `timeZone` ultimately comes from the client, so an unrecognized value must
 * never take down a render: `Intl.DateTimeFormat` throws a RangeError on one.
 * On failure — or with no zone at all — this falls back to the runtime zone,
 * which is the best a server can do until the browser tells us better.
 */
export function hourInZone(date: Date, timeZone?: string | null): number {
  if (timeZone) {
    try {
      const hour = new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        // h23 so midnight is 0 and not "24"; without it `hourCycle` varies by
        // locale data and the parse below would read 12 for midnight.
        hourCycle: 'h23',
        timeZone,
      }).format(date);
      const parsed = Number.parseInt(hour, 10);
      if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 23) return parsed;
    } catch {
      // Fall through to the runtime zone.
    }
  }
  return date.getHours();
}

/** The greeting for `date` as read on a clock in `timeZone`. */
export function greetingFor(date: Date, timeZone?: string | null): Greeting {
  const hour = hourInZone(date, timeZone);
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
