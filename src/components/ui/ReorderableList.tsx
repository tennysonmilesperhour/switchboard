'use client';

import { useCallback, useId, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { dropIndexFor, slideOffset } from '@/lib/reorder';

/**
 * A list whose rows can be picked up and dropped somewhere else.
 *
 * "I'm picturing draggable boxes like on maps when you want to change the
 * order of your stops." That is the ask this answers, and it is worth being
 * precise about why it is not `draggable="true"` and eight lines of
 * `onDragOver`: HTML5 drag and drop does not exist on iOS Safari, which is
 * where the ask came from. So this is built on pointer events, which are the
 * same three handlers for a mouse, a trackpad, a finger and a stylus.
 *
 * Three rules it does not bend:
 *
 * - **Only the grip drags.** `touch-action: none` is set on the handle and
 *   nowhere else, so a finger anywhere on the row still scrolls the page. A
 *   list that eats vertical scroll is worse than a list that cannot be
 *   reordered.
 * - **The keyboard gets the same list.** The grip is a real button; with it
 *   focused, the arrow keys move the row and announce where it landed. Nothing
 *   here is reachable only by dragging.
 * - **Reordering is not the only verb.** A row can carry its own controls, and
 *   `onRemove` puts a delete on every row, because "can this be editable and
 *   deletable" was one question, not two.
 *
 * The component owns only the drag in flight. The order itself belongs to the
 * caller: `onReorder` is told the two indexes, and the next render is the
 * answer. Nothing is stored here that would survive a row arriving or leaving.
 */

export interface ReorderableItem {
  /** Stable across renders — a draft key, or an invite id. */
  key: string;
  /** What the drag announcements call this row. */
  label: string;
}

interface ReorderableListProps<T extends ReorderableItem> {
  items: readonly T[];
  /** The row's contents. The grip and the remove button are drawn around it. */
  children: (item: T, index: number) => ReactNode;
  /**
   * Move the row at `from` to `to`. Omit to render a plain list — which is
   * what a plan where order means nothing gets, rather than a handle that
   * rearranges something nobody will read.
   */
  onReorder?: (from: number, to: number) => void;
  /** Drop the row entirely. Omit for a list nothing can leave. */
  onRemove?: (item: T, index: number) => void;
  /** Per-row override for the remove control. */
  canRemove?: (item: T, index: number) => boolean;
  removeLabel?: (item: T) => string;
  /** Classes for each row's own surface. Rows are plates, so this carries one. */
  rowClassName?: string | ((item: T, index: number) => string);
  className?: string;
  /** Announced when the list is empty of anything to say. */
  'aria-label'?: string;
}

interface DragState {
  /** Where the row started, in list order. */
  from: number;
  /** Where it would land if the finger lifted now. */
  to: number;
  /** Pointer travel since the grip went down, in pixels. */
  offset: number;
  /** The dragged row's height, for the gap the other rows open. */
  height: number;
  pointerId: number;
}

export function ReorderableList<T extends ReorderableItem>({
  items,
  children,
  onReorder,
  onRemove,
  canRemove,
  removeLabel,
  rowClassName = 'bg-cream',
  className = '',
  'aria-label': ariaLabel,
}: ReorderableListProps<T>) {
  const listRef = useRef<HTMLOListElement>(null);
  /**
   * The drag in flight, held in a ref AND in state.
   *
   * The ref is the source of truth and the state is only what the rows are
   * drawn from. Two reasons, and both of them are bugs this had:
   *
   * - `pointerup` can arrive before React has flushed the render for the last
   *   `pointermove`, so a handler reading the state variable out of its
   *   closure can drop the final few pixels of travel — and with them the last
   *   slot the row crossed.
   * - Deciding the drop inside a `setState` updater put a call to `onReorder`
   *   in a function React is allowed to run twice, which in development moved
   *   the row two places for one drag.
   */
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  /** Row heights as they were when the grip went down — see `dropIndexFor`. */
  const heights = useRef<number[]>([]);
  const startY = useRef(0);
  /** What a screen reader is told after a move. */
  const [announcement, setAnnouncement] = useState('');
  const announceId = useId();

  function updateDrag(next: DragState | null) {
    dragRef.current = next;
    setDrag(next);
  }

  // A drag that outlives its list — the row lifted out from under the finger
  // by a removal elsewhere — would otherwise leave every row frozen mid-slide.
  // Ignored during render rather than cleared in an effect, so there is no
  // frame where the stale offsets are still on screen.
  const live = drag && drag.from < items.length ? drag : null;

  const measure = useCallback(() => {
    const rows = listRef.current?.querySelectorAll<HTMLLIElement>(':scope > li');
    heights.current = rows
      ? Array.from(rows).map((row) => row.getBoundingClientRect().height)
      : [];
  }, []);

  function beginDrag(event: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (!onReorder || event.button > 0) return;
    measure();
    startY.current = event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    updateDrag({
      from: index,
      to: index,
      offset: 0,
      height: heights.current[index] ?? 0,
      pointerId: event.pointerId,
    });
  }

  function continueDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const offset = event.clientY - startY.current;
    updateDrag({
      ...current,
      offset,
      to: dropIndexFor(heights.current, current.from, offset),
    });
  }

  /** The gesture was taken away from us (a system gesture, a lost pointer). */
  function cancelDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId === event.pointerId) updateDrag(null);
  }

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    updateDrag(null);
    // The row can be taken out from under the finger by a change elsewhere in
    // the list; committing a move for a row that is no longer there would
    // reorder whoever inherited its index.
    if (current.from >= items.length || current.to >= items.length) return;
    if (current.to === current.from || !onReorder) return;
    onReorder(current.from, current.to);
    setAnnouncement(
      `${items[current.from]?.label ?? 'Row'} moved to position ${current.to + 1} of ${items.length}.`,
    );
  }

  function moveByKey(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!onReorder) return;
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    // Only now, so a plain arrow key still scrolls a list this one cannot move.
    event.preventDefault();
    onReorder(index, target);
    setAnnouncement(
      `${items[index].label} moved to position ${target + 1} of ${items.length}.`,
    );
  }

  return (
    <div className={className}>
      <ol ref={listRef} aria-label={ariaLabel} className="space-y-2">
        {items.map((item, index) => {
          const reorderable = Boolean(onReorder);
          const dragging = live?.from === index;
          const offset = live
            ? dragging
              ? live.offset
              : slideOffset(index, live.from, live.to, live.height)
            : 0;
          const removable = Boolean(onRemove) && (canRemove ? canRemove(item, index) : true);
          return (
            <li
              key={item.key}
              style={
                offset === 0
                  ? undefined
                  : { transform: `translateY(${offset}px)`, zIndex: dragging ? 20 : undefined }
              }
              className={`relative flex items-center gap-2 rounded-card px-2.5 py-2.5 ${
                typeof rowClassName === 'function' ? rowClassName(item, index) : rowClassName
              } ${dragging ? 'shadow-float' : ''} ${
                // Sliding rows animate; the dragged one follows the finger with
                // no transition at all, or it lags behind it.
                live && !dragging ? 'transition-transform duration-150' : ''
              }`}
            >
              {reorderable && (
                <button
                  type="button"
                  aria-label={`Reorder ${item.label}. Position ${index + 1} of ${items.length}. Use the arrow keys to move.`}
                  aria-describedby={announceId}
                  onPointerDown={(event) => beginDrag(event, index)}
                  onPointerMove={continueDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={cancelDrag}
                  onKeyDown={(event) => moveByKey(event, index)}
                  // The one place touch scrolling is given up, so the rest of
                  // the row keeps it.
                  style={{ touchAction: 'none' }}
                  className={`-ml-1 shrink-0 cursor-grab rounded-card p-1.5 text-ink-faint transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                    dragging ? 'cursor-grabbing text-terracotta-deep' : ''
                  }`}
                >
                  <Icon name="drag" size={18} />
                </button>
              )}
              <div className="min-w-0 flex-1">{children(item, index)}</div>
              {removable && (
                <button
                  type="button"
                  onClick={() => onRemove?.(item, index)}
                  aria-label={removeLabel?.(item) ?? `Remove ${item.label}`}
                  className="shrink-0 rounded-pill p-1.5 text-ink-faint transition-colors hover:bg-rose-soft hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
                >
                  <Icon name="close" size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ol>
      <p id={announceId} role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
