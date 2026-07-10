/**
 * Event-thread visibility gate (pure).
 *
 * The thread is a running commentary on an event. People who've RSVP'd (plus
 * the host and co-hosts) read all of it and can post; everyone else who can see
 * the event gets only the opening `previewCount` messages, which blur out as
 * they go down the page — a gentle "join to read the rest" gate rather than a
 * hard wall.
 *
 * This computes what to render from the true total and the caller's access.
 * It never sees gated bodies — the server only hands the preview slice to a
 * locked viewer — so the shape here is safe to compute on the client.
 */

/** How many opening messages a non-RSVP'd viewer may read. */
export const THREAD_PREVIEW_COUNT = 2;

export interface ThreadGate {
  /** The viewer may read the full thread and post to it. */
  unlocked: boolean;
  /**
   * Number of real messages the viewer sees. Full access → all of them;
   * locked → at most `previewCount` (never more than exist).
   */
  visibleCount: number;
  /** Messages hidden behind the blur (0 when unlocked). */
  hiddenCount: number;
  /**
   * How many blurred placeholder rows to draw beneath the preview. Bounded so a
   * huge thread doesn't paint a wall of skeletons; the real count is shown in
   * the gate copy instead.
   */
  blurRows: number;
}

/**
 * @param total       true number of comments on the event
 * @param canAccess   viewer has RSVP'd / hosts the event
 * @param previewCount opening messages a locked viewer may read
 * @param maxBlurRows  cap on placeholder rows drawn under the preview
 */
export function threadGate(
  total: number,
  canAccess: boolean,
  previewCount: number = THREAD_PREVIEW_COUNT,
  maxBlurRows = 4,
): ThreadGate {
  const safeTotal = Math.max(0, Math.floor(total));
  if (canAccess) {
    return { unlocked: true, visibleCount: safeTotal, hiddenCount: 0, blurRows: 0 };
  }
  const visibleCount = Math.min(safeTotal, Math.max(0, previewCount));
  const hiddenCount = safeTotal - visibleCount;
  return {
    unlocked: false,
    visibleCount,
    hiddenCount,
    blurRows: Math.min(hiddenCount, maxBlurRows),
  };
}
