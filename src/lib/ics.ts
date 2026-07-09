/**
 * iCalendar (RFC 5545) helpers, shared by the per-event download route and the
 * personal "all my plans" subscription feed.
 */

export interface IcsEvent {
  id: string;
  title: string;
  description?: string | null;
  location_name?: string | null;
  location_address?: string | null;
  starts_at: string | null;
  ends_at?: string | null;
}

export function icsEscape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** One VEVENT block for an event, or null if it has no start time. */
export function vevent(event: IcsEvent, dtstamp: string): string[] | null {
  if (!event.starts_at) return null;
  const start = icsDate(event.starts_at);
  const end = icsDate(
    event.ends_at ??
      new Date(new Date(event.starts_at).getTime() + 2 * 3_600_000).toISOString(),
  );
  const location = [event.location_name, event.location_address]
    .filter(Boolean)
    .join(', ');
  return [
    'BEGIN:VEVENT',
    `UID:${event.id}@switchboard`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${icsEscape(event.title)}`,
    event.description ? `DESCRIPTION:${icsEscape(event.description)}` : null,
    location ? `LOCATION:${icsEscape(location)}` : null,
    'END:VEVENT',
  ].filter((line): line is string => line !== null);
}

/** A full VCALENDAR wrapping any number of events. `now` is the DTSTAMP. */
export function buildCalendar(events: IcsEvent[], now: string): string {
  const dtstamp = icsDate(now);
  const blocks = events
    .map((event) => vevent(event, dtstamp))
    .filter((block): block is string[] => block !== null)
    .flat();
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Switchboard//EN',
    'CALSCALE:GREGORIAN',
    'X-WR-CALNAME:Switchboard plans',
    ...blocks,
    'END:VCALENDAR',
  ].join('\r\n');
}
