/** Formatting helpers - Intl-based, no library dependency. */

/**
 * Render an event's start as "Tue, Jul 14, 6:00 PM CDT".
 *
 * `starts_at` is a UTC instant; on its own it has no wall-clock meaning until
 * it's localized. In the browser Intl uses the viewer's zone, but on the server
 * (OG images, SSR pages, guest invite links) there is no viewer and it falls
 * back to the runtime zone — UTC on Vercel — which is what made a 6pm plan
 * unfurl as "12:00 AM". Pass the event's own `time_zone` so server and client
 * agree on the host's intended time, and the short zone label removes any doubt
 * about whose clock it is. Falls back to the runtime zone when `timeZone` is
 * absent (undated events, or plans created before the zone was captured).
 */
export function formatDateTime(
  iso: string | null,
  timeZone?: string | null,
): string {
  if (!iso) return 'Time TBD';
  return format(new Date(iso), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...(timeZone ? { timeZone, timeZoneName: 'short' } : {}),
  });
}

export function formatDate(iso: string | null, timeZone?: string | null): string {
  if (!iso) return 'Date TBD';
  return format(new Date(iso), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });
}

/**
 * `Intl.DateTimeFormat` throws a RangeError on an unrecognized `timeZone`, and
 * `time_zone` ultimately comes from the client — so a malformed value must never
 * take down a server render. On failure, retry without the zone (the value that
 * matters, the instant, still renders; only the localization is lost).
 */
function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat('en-US', options).format(date);
  } catch {
    const { timeZone, timeZoneName, ...zoneless } = options;
    void timeZone;
    void timeZoneName;
    return new Intl.DateTimeFormat('en-US', zoneless).format(date);
  }
}

export function formatWindow(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const hours = minutes / 60;
    return hours === 1 ? '1 hour' : `${hours} hours`;
  }
  const days = minutes / (24 * 60);
  if (days < 7) return days === 1 ? '1 day' : `${days} days`;
  const weeks = days / 7;
  return weeks === 1 ? '1 week' : `${weeks} weeks`;
}

export function formatRelative(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60_000) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diffMs / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diffMs / 3_600_000), 'hour');
  return rtf.format(Math.round(diffMs / 86_400_000), 'day');
}
