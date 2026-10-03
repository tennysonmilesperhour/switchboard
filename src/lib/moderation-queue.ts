/**
 * Read-side ordering for the moderation queue. A report stays open until a
 * moderator marks it actioned or dismisses it, even after someone has already
 * removed the content or suspended its author. Those reports are not hidden
 * (the decision still needs closing), but they sort below the ones nobody has
 * acted on yet and say what was already done.
 */

export interface QueueReport {
  target_kind: string | null;
  target_removed_at: string | null;
  reported_suspended_until: string | null;
}

/** What has already been done about this report, or null when nothing has. */
export function alreadyHandled(report: QueueReport): string | null {
  const removed = report.target_removed_at
    ? report.target_kind === 'room_message'
      ? 'message removed'
      : 'post removed'
    : null;
  const suspended = report.reported_suspended_until ? 'account suspended' : null;
  if (removed && suspended) return `Already handled: ${removed} and ${suspended}`;
  if (removed ?? suspended) return `Already handled: ${removed ?? suspended}`;
  return null;
}

/**
 * Unhandled reports first, handled ones after, each group keeping the order
 * it came in (oldest first, from `list_open_reports`).
 */
export function splitQueue<T extends QueueReport>(reports: T[]): { open: T[]; handled: T[] } {
  const open: T[] = [];
  const handled: T[] = [];
  for (const report of reports) (alreadyHandled(report) ? handled : open).push(report);
  return { open, handled };
}
