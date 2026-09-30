/**
 * Which realtime changes to `notifications` deserve a live banner.
 *
 * Coalescing notifiers (room messages, poll suggestions) do not insert a new
 * row for every event: within their window they rewrite the standing unread
 * row in place — new title, `created_at` moved to now. Listening to INSERTs
 * alone therefore went quiet after the first message in a room, and so did
 * everything that refreshes from this feed, the rooms inbox included (G12).
 *
 * An UPDATE is also how a row is marked read or cleared, and those must not
 * raise a banner. The rule: a change is a new *moment* when the row is unread,
 * and a moment is identified by the row id plus its `created_at`, so a
 * re-delivery of the same moment is shown once and a bump is shown again.
 */

/** `id:created_at` for an unread row; null for anything that isn't news. */
export function freshNotificationMoment(value: Record<string, unknown>): string | null {
  if (typeof value.id !== 'string') return null;
  if (value.read_at !== null && value.read_at !== undefined) return null;
  const at = typeof value.created_at === 'string' ? value.created_at : '';
  return `${value.id}:${at}`;
}
