import { distanceMeters, formatDistance, type MapPoint } from '@/lib/geo';

/**
 * Pure helpers for "Find each other": exact location between two matched
 * people (src/lib/actions/exact-location.ts). Kept free of React and the
 * network so the rules are tested on their own.
 */

/**
 * Said when the room is not one this works in, or no longer is: a group room,
 * a block, a sabbatical, or the other person left. One sentence for all of
 * them, so it never tells someone they were blocked.
 */
export const EXACT_NOT_ALLOWED =
  'Exact location isn’t available in this conversation. It works between two people who matched, while you’re both still here.';

/** The note posted in the room when someone turns it on, so the other person knows. */
export const EXACT_STARTED_MESSAGE =
  '📍 I’m sharing my exact location for the next hour so we can find each other. Tap “Find each other” at the top of this chat to share yours.';

/** How long one share lasts. Mirrors the interval in 20261008120000. */
export const EXACT_SHARE_MINUTES = 60;

/** How often the room asks for the other person's point while both share. */
export const EXACT_POLL_MS = 5_000;

/**
 * A new point is sent when the person has moved this far, but never sooner
 * than EXACT_MIN_GAP_MS after the last write. Standing still, a heartbeat
 * every EXACT_HEARTBEAT_MS keeps the point fresh (the database hides a point
 * silent for 15 minutes).
 */
export const EXACT_MIN_MOVE_M = 3;
export const EXACT_MIN_GAP_MS = 4_000;
export const EXACT_HEARTBEAT_MS = 60_000;

/** Whether a new fix should be written, given the last one written and when. */
export function shouldSendExact(
  last: { point: MapPoint; at: number } | null,
  next: MapPoint,
  now: number,
): boolean {
  if (!last) return true;
  const gap = now - last.at;
  if (gap >= EXACT_HEARTBEAT_MS) return true;
  if (gap < EXACT_MIN_GAP_MS) return false;
  return distanceMeters(last.point, next) >= EXACT_MIN_MOVE_M;
}

/** Initial compass bearing from `from` to `to`, in degrees clockwise from north. */
export function bearingDegrees(from: MapPoint, to: MapPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

export function compassDirection(degrees: number): (typeof COMPASS)[number] {
  return COMPASS[Math.round((((degrees % 360) + 360) % 360) / 45) % 8];
}

/**
 * Below this, two phones' own error is bigger than the gap between them, so a
 * direction would be noise.
 */
export const EXACT_TOGETHER_M = 15;

/** One line for where the other person is, relative to the reader. */
export function describeGap(me: MapPoint, them: MapPoint, name: string): string {
  const meters = distanceMeters(me, them);
  if (meters < EXACT_TOGETHER_M) return `${name} is right around you.`;
  return `${name} is about ${formatDistance(meters)} ${compassDirection(bearingDegrees(me, them))} of you.`;
}

/**
 * Walking directions to a point in the phone's own maps app: Apple Maps on
 * iPhone and iPad, Google Maps everywhere else. Built from numbers only, so
 * nothing a person typed reaches the URL.
 */
export function walkingDirectionsUrl(to: MapPoint, apple: boolean): string {
  const lat = to.lat.toFixed(6);
  const lng = to.lng.toFixed(6);
  return apple
    ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
    : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
}

export function isAppleDevice(userAgent: string): boolean {
  return /iPhone|iPad|iPod|Macintosh/.test(userAgent);
}

/** "8 s ago", "3 min ago": how fresh the other person's point is. */
export function freshness(updatedAt: string, now: number): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(updatedAt)) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  return `${Math.round(seconds / 60)} min ago`;
}

/** Minutes left on a share, never below zero. */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 60_000));
}
