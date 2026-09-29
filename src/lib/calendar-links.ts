/**
 * One-tap "add to calendar" links. The .ics download (see the ics route)
 * covers Apple/Outlook; these deep links cover the web calendars people
 * actually tap on a phone. Pure and dependency-free so they're unit-tested.
 *
 * These point at third-party calendars. A link back into Switchboard — such as
 * the personal subscription feed — is built in `src/lib/links.ts`
 * (`calendarFeedUrl` / `webcalSubscribeUrl`), on its one validated origin.
 */

export interface CalendarEvent {
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string; // ISO
  endsAt?: string | null; // ISO
}

/** Google Calendar wants basic UTC stamps: YYYYMMDDTHHMMSSZ. */
function stamp(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function endOrDefault(event: CalendarEvent): string {
  if (event.endsAt) return event.endsAt;
  return new Date(new Date(event.startsAt).getTime() + 2 * 3_600_000).toISOString();
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${stamp(event.startsAt)}/${stamp(endOrDefault(event))}`,
  });
  if (event.description) params.set('details', event.description);
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: event.startsAt,
    enddt: endOrDefault(event),
  });
  if (event.description) params.set('body', event.description);
  if (event.location) params.set('location', event.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

