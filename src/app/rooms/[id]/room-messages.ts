/** One message as the room renders it. */
export interface RoomMessage {
  id: string;
  sender_id: string;
  body: string;
  /**
   * The stored photo reference: a private storage path for photos sent since
   * room photos went private, or a legacy public URL. Never rendered directly.
   */
  image_url: string | null;
  /**
   * What an `<img>` may load for `image_url`: a short-lived signed URL minted by
   * the server for this viewer, a local preview while the sender's own upload
   * is in flight, or null when there is nothing to show. `undefined` means not
   * resolved yet (a photo that just arrived over realtime).
   */
  image_src?: string | null;
  created_at: string;
}

/** Ids given to a message shown before the server has confirmed it. */
export const OPTIMISTIC_PREFIX = 'optimistic-';

/** How many messages the room page and "load earlier" read at a time. */
export const ROOM_PAGE_SIZE = 200;

function time(message: RoomMessage): number {
  const parsed = Date.parse(message.created_at);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Fold a fresh server read of the room into what is already on screen.
 *
 * The room's list was seeded from the server once and afterwards only grew by
 * realtime INSERTs. A realtime delivery that never arrives — a phone asleep, a
 * socket that dropped and rejoined — is not replayed, and `router.refresh()`
 * handed the component new props it ignored, so a missed message stayed missing
 * until a full reload. The server copy is the record:
 *
 *   - anything in it that is not on screen is added;
 *   - a placeholder the server has now confirmed (same sender, same body, among
 *     the newly seen rows) is swapped out rather than shown twice;
 *   - a message the server no longer has, dated inside the window the server
 *     read covers, was deleted by its sender and goes (realtime does not
 *     deliver deletes, so a refresh is how the rest of the room hears);
 *   - a photo that arrived over realtime picks up the signed URL the server
 *     minted for it.
 *
 * Nothing outside the server's window is dropped, so a message loaded with
 * "Load earlier", or one that arrived after this read was taken, stays put.
 *
 * Returns `current` itself when nothing changed, so callers can skip a
 * re-render.
 */
export function mergeRoomMessages(
  current: RoomMessage[],
  server: RoomMessage[],
): RoomMessage[] {
  const serverById = new Map(server.map((message) => [message.id, message]));
  const known = new Set(current.map((message) => message.id));
  const fresh = server.filter((message) => !known.has(message.id));
  const serverTimes = server.map(time);
  const oldest = serverTimes.length ? Math.min(...serverTimes) : Number.POSITIVE_INFINITY;
  const newest = serverTimes.length ? Math.max(...serverTimes) : Number.NEGATIVE_INFINITY;

  let changed = fresh.length > 0;
  const unclaimed = [...fresh];
  const kept: RoomMessage[] = [];

  for (const message of current) {
    if (message.id.startsWith(OPTIMISTIC_PREFIX)) {
      const confirmed = unclaimed.findIndex(
        (row) => row.sender_id === message.sender_id && row.body === message.body,
      );
      if (confirmed === -1) {
        kept.push(message);
      } else {
        unclaimed.splice(confirmed, 1);
        changed = true;
      }
      continue;
    }

    const fromServer = serverById.get(message.id);
    if (!fromServer) {
      const at = time(message);
      if (at >= oldest && at <= newest) {
        changed = true; // deleted since it was shown
        continue;
      }
      kept.push(message);
      continue;
    }

    if (fromServer.image_src !== undefined && fromServer.image_src !== message.image_src) {
      kept.push({ ...message, image_src: fromServer.image_src });
      changed = true;
      continue;
    }
    kept.push(message);
  }

  if (!changed) return current;
  return [...kept, ...fresh].sort((a, b) => time(a) - time(b));
}

/**
 * Put a page of older messages in front of what is on screen, skipping any the
 * list already holds (a refresh may have raced the load).
 */
export function prependEarlierMessages(
  current: RoomMessage[],
  earlier: RoomMessage[],
): RoomMessage[] {
  const known = new Set(current.map((message) => message.id));
  const additions = earlier.filter((message) => !known.has(message.id));
  if (additions.length === 0) return current;
  return [...additions, ...current].sort((a, b) => time(a) - time(b));
}
