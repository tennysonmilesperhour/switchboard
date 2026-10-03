/**
 * The rules a zone lives by, stated once for the screens that explain them.
 *
 * The database is what enforces each of these
 * (`20260930040000_private_zone_requests.sql`,
 * `20260930043000_zone_end_dates.sql`); this module only lets the pages say the
 * same thing the database will do, without each of them re-deriving it.
 */

/** A denied or removed requester waits this long before their one new ask. */
export const ZONE_REASK_DAYS = 30;
/** The first ask plus one more (D10). */
export const ZONE_MAX_ASKS = 2;
/** A zone ends this long after it is made unless its organizer says otherwise. */
export const ZONE_DEFAULT_DAYS = 7;
/** The furthest ahead an organizer may set an end date. */
export const ZONE_MAX_DAYS = 366;
/** "Near me" on /zones: zones anchored within this distance. */
export const ZONE_NEAR_ME_METERS = 50_000;

const DAY_MS = 86_400_000;

/** Where someone outside a private zone stands with it. */
export type ZoneRequestState =
  | { kind: 'none' }
  | { kind: 'pending' }
  /** Denied or removed, and their one new ask is available now. */
  | { kind: 'reask'; reason: 'denied' | 'removed' }
  /** Denied or removed, and must wait until `retryAfter`. */
  | { kind: 'wait'; reason: 'denied' | 'removed'; retryAfter: string }
  /** Denied or removed after already using their one new ask. */
  | { kind: 'closed'; reason: 'denied' | 'removed' };

export interface ZoneRequestRow {
  status: string;
  asks: number;
  created_at: string;
  decided_at: string | null;
}

/**
 * The requester's own request row (readable to them under RLS), read the way
 * `request_zone_join` will act on it. A row the database would treat as a
 * fresh ask (`approved` but not a member — they left) reads as `none`.
 */
export function zoneRequestState(
  row: ZoneRequestRow | null | undefined,
  now: number = Date.now(),
): ZoneRequestState {
  if (!row) return { kind: 'none' };
  if (row.status === 'pending') return { kind: 'pending' };
  if (row.status !== 'denied' && row.status !== 'removed') return { kind: 'none' };
  const reason = row.status;
  if (row.asks >= ZONE_MAX_ASKS) return { kind: 'closed', reason };
  const decided = Date.parse(row.decided_at ?? row.created_at);
  const reopens = (Number.isFinite(decided) ? decided : now) + ZONE_REASK_DAYS * DAY_MS;
  if (reopens > now) {
    return { kind: 'wait', reason, retryAfter: new Date(reopens).toISOString() };
  }
  return { kind: 'reask', reason };
}

/** Whether a zone is still on. A missing or unreadable end counts as on. */
export function zoneIsActive(endsAt: string | null | undefined, now: number = Date.now()): boolean {
  if (!endsAt) return true;
  const ends = Date.parse(endsAt);
  return !Number.isFinite(ends) || ends > now;
}

/** The default end for a new zone, as an ISO string. */
export function defaultZoneEnd(now: number = Date.now()): string {
  return new Date(now + ZONE_DEFAULT_DAYS * DAY_MS).toISOString();
}

/**
 * Read an organizer's end date from a form. Accepts a `YYYY-MM-DD` day (the
 * zone ends at the close of that day, UTC) or a full timestamp. Returns null for
 * anything unreadable, in the past, or beyond {@link ZONE_MAX_DAYS}.
 */
export function parseZoneEnd(raw: unknown, now: number = Date.now()): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value) return null;
  const ms = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T23:59:59Z`)
    : Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  if (ms <= now || ms > now + ZONE_MAX_DAYS * DAY_MS) return null;
  return new Date(ms).toISOString();
}

/**
 * The `YYYY-MM-DD` an organizer picked, read back from a stored end. A picked
 * day is saved as the close of that day in UTC ({@link parseZoneEnd}), and the
 * zone page shows that UTC day, so the form reads it in UTC too. Read in the
 * browser's own zone, anyone east of UTC saw the next day after saving.
 */
export function zoneEndDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/**
 * Escape a search term for a Postgres `ILIKE` pattern, so `%` and `_` typed by
 * a reader match themselves instead of everything. Also drops the characters
 * PostgREST's filter grammar reserves, and caps the length.
 */
export function ilikeTerm(raw: string, max = 60): string {
  return raw
    .trim()
    .slice(0, max)
    .replace(/[(),]/g, ' ')
    .replace(/[\\%_]/g, (match) => `\\${match}`)
    .trim();
}
