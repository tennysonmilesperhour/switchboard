/**
 * The visitor's IANA time zone (e.g. "America/Chicago"), resolved from the
 * browser. Stored on an event so server-side renders — which have no viewer
 * zone and otherwise fall back to UTC — can show the host's intended local time.
 *
 * Returns null when the environment can't resolve a real zone (older engines,
 * or an SSR call), so callers store null rather than a misleading "UTC".
 */
export function resolveTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && zone.length > 0 ? zone : null;
  } catch {
    return null;
  }
}
