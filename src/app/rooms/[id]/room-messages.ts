/** One message as the room renders it. */
export interface RoomMessage {
  id: string;
  sender_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
}

/** Ids given to a message shown before the server has confirmed it. */
export const OPTIMISTIC_PREFIX = 'optimistic-';

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
 * until a full reload. The server copy is the record: anything in it that is not
 * on screen is added, and a placeholder the server has now confirmed (same
 * sender, same body, among the newly seen rows) is swapped out rather than
 * shown twice. Nothing already on screen is dropped, so a message older than
 * the server's window stays put.
 *
 * Returns `current` itself when there is nothing new, so callers can skip a
 * re-render.
 */
export function mergeRoomMessages(
  current: RoomMessage[],
  server: RoomMessage[],
): RoomMessage[] {
  const known = new Set(current.map((message) => message.id));
  const fresh = server.filter((message) => !known.has(message.id));
  if (fresh.length === 0) return current;

  const unclaimed = [...fresh];
  const kept = current.filter((message) => {
    if (!message.id.startsWith(OPTIMISTIC_PREFIX)) return true;
    const confirmed = unclaimed.findIndex(
      (row) => row.sender_id === message.sender_id && row.body === message.body,
    );
    if (confirmed === -1) return true;
    unclaimed.splice(confirmed, 1);
    return false;
  });

  return [...kept, ...fresh].sort((a, b) => time(a) - time(b));
}
