import { coarsenCoordinate, type MapPoint } from '@/lib/geo';

/**
 * Decides which live-location fixes are sent to the server, and when.
 *
 * A real phone does not hand over one clean point per move:
 *
 *   - Sitting still on the edge between two ~110 m cells, its fix wobbles a
 *     few metres either side of the edge every second. Sending every new cell
 *     sent ~1 write a second (41 in 40 s, measured): the 300-an-hour budget
 *     was gone in five minutes, after which every update was refused and the
 *     pin silently froze.
 *   - Sitting still in the middle of a cell, `watchPosition` may not fire for a
 *     long time, so nothing told the server the person was still there, and a
 *     locked phone looked the same as an open one.
 *
 * So: a new cell is sent, but never sooner than MIN_GAP_MS after the last
 * write (the latest fix waits and goes out when the gap is up), and a
 * heartbeat re-sends the latest fix every HEARTBEAT_MS while the page runs.
 * The server hides a pin whose last write is older than its freshness window
 * (20261006140000_live_location_freshness.sql), so the heartbeat is what keeps
 * an open page visible. At most 60/15 = 4 writes a minute, heartbeat included:
 * 240 an hour, under the 300 the server allows.
 */
export const MIN_GAP_MS = 15_000;
export const HEARTBEAT_MS = 4 * 60_000;

export interface Fix {
  point: MapPoint;
  accuracyM: number | null;
}

export interface PositionSender {
  /** A fix from `watchPosition`. */
  push: (fix: Fix) => void;
  /** The share was (re)started with `fix`, which the caller already stored. */
  sent: (fix: Fix) => void;
  stop: () => void;
}

interface Clock {
  now: () => number;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

const cellOf = (point: MapPoint) => `${coarsenCoordinate(point.lat)},${coarsenCoordinate(point.lng)}`;

export function createPositionSender(send: (fix: Fix) => void, clock: Clock = realClock): PositionSender {
  let latest: Fix | null = null;
  let lastCell: string | null = null;
  let lastAt = Number.NEGATIVE_INFINITY;
  let trailing: unknown = null;

  const write = () => {
    if (!latest) return;
    if (trailing !== null) {
      clock.clearTimeout(trailing);
      trailing = null;
    }
    lastCell = cellOf(latest.point);
    lastAt = clock.now();
    send(latest);
  };

  /** Send now if the gap allows, else once it does (one pending write at most). */
  const writeSoon = () => {
    const wait = lastAt + MIN_GAP_MS - clock.now();
    if (wait <= 0) write();
    else if (trailing === null) trailing = clock.setTimeout(write, wait);
  };

  const heartbeat = clock.setInterval(() => {
    if (latest) writeSoon();
  }, HEARTBEAT_MS);

  return {
    push(fix) {
      latest = fix;
      if (cellOf(fix.point) === lastCell) return;
      writeSoon();
    },
    sent(fix) {
      latest = fix;
      lastCell = cellOf(fix.point);
      lastAt = clock.now();
    },
    stop() {
      if (trailing !== null) clock.clearTimeout(trailing);
      trailing = null;
      clock.clearInterval(heartbeat);
    },
  };
}
