/**
 * Moving one row of a list to another place in it, and working out where a
 * dragging finger means.
 *
 * Kept away from the component that draws the list for the usual reason: the
 * arithmetic of "which slot is this pointer over" is the part that goes subtly
 * wrong — off by one on the way down but not on the way up, or fine with equal
 * rows and wrong the moment one wraps to two lines — and it is the part a test
 * can hold still. `ReorderableList` does the events and the transforms; every
 * index it computes comes from here.
 */

/** `list` with the item at `from` lifted out and dropped in at `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= next.length ||
    to < 0 ||
    to >= next.length ||
    from === to
  ) {
    return next;
  }
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** `list` with the item at `index` moved one place up (-1) or down (+1). */
export function shiftItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  return moveItem(list, index, index + delta);
}

/**
 * Where a row being dragged from `from` should land, given how far it has
 * moved and how tall each row is.
 *
 * The rule is the one every list with a drag handle uses, stated in terms of
 * the ROWS THAT HAVE NOT MOVED: the dragged row has travelled far enough to
 * pass a neighbour once its leading edge is past that neighbour's midpoint.
 * Working from the untouched heights — rather than from live element positions,
 * which are being transformed as the drag proceeds — is what keeps the answer
 * stable while the finger is still down.
 *
 * `heights` is every row's height in list order, so a row that wraps to two
 * lines is passed at its own midpoint rather than at an assumed uniform one.
 */
export function dropIndexFor(
  heights: readonly number[],
  from: number,
  /** How far the dragged row has moved, in pixels; negative is upward. */
  offset: number,
): number {
  if (heights.length === 0) return 0;
  const start = Math.min(Math.max(from, 0), heights.length - 1);
  if (offset < 0) {
    let remaining = -offset;
    let index = start;
    while (index > 0 && remaining > heights[index - 1] / 2) {
      remaining -= heights[index - 1];
      index -= 1;
    }
    return index;
  }
  let remaining = offset;
  let index = start;
  while (index < heights.length - 1 && remaining > heights[index + 1] / 2) {
    remaining -= heights[index + 1];
    index += 1;
  }
  return index;
}

/**
 * How far a row that is NOT being dragged should slide while the drag is in
 * flight, so the gap opens where the row will land.
 *
 * Every row between the old slot and the new one moves by the dragged row's
 * height, in the opposite direction to the drag; everything outside that span
 * stays where it is.
 */
export function slideOffset(
  index: number,
  from: number,
  to: number,
  draggedHeight: number,
): number {
  if (index === from || from === to) return 0;
  if (from < to) return index > from && index <= to ? -draggedHeight : 0;
  return index >= to && index < from ? draggedHeight : 0;
}
