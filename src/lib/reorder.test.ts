import { describe, expect, it } from 'vitest';
import { dropIndexFor, moveItem, shiftItem, slideOffset } from './reorder';

const LIST = ['a', 'b', 'c', 'd'];

describe('moveItem', () => {
  it('moves a row down, closing the gap behind it', () => {
    expect(moveItem(LIST, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('moves a row up', () => {
    expect(moveItem(LIST, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns a copy, never the same array', () => {
    const same = moveItem(LIST, 1, 1);
    expect(same).toEqual(LIST);
    expect(same).not.toBe(LIST);
  });

  it('ignores indexes that are not slots in the list', () => {
    for (const [from, to] of [[-1, 2], [0, 9], [4, 0], [0.5, 2], [NaN, 1]]) {
      expect(moveItem(LIST, from, to)).toEqual(LIST);
    }
  });

  it('has nothing to do to an empty list', () => {
    expect(moveItem([], 0, 0)).toEqual([]);
  });
});

describe('shiftItem', () => {
  it('swaps with the neighbour in that direction', () => {
    expect(shiftItem(LIST, 1, -1)).toEqual(['b', 'a', 'c', 'd']);
    expect(shiftItem(LIST, 1, 1)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('stops at both ends rather than wrapping', () => {
    expect(shiftItem(LIST, 0, -1)).toEqual(LIST);
    expect(shiftItem(LIST, 3, 1)).toEqual(LIST);
  });
});

describe('dropIndexFor', () => {
  const even = [60, 60, 60, 60];

  it('stays put until the row has passed half of its neighbour', () => {
    expect(dropIndexFor(even, 0, 0)).toBe(0);
    expect(dropIndexFor(even, 0, 29)).toBe(0);
    expect(dropIndexFor(even, 0, 31)).toBe(1);
  });

  /**
   * The symmetry that goes wrong first: dragging down by N rows and back up by
   * the same N has to land where it started.
   */
  it('is symmetric between up and down', () => {
    expect(dropIndexFor(even, 0, 150)).toBe(2);
    expect(dropIndexFor(even, 2, -150)).toBe(0);
  });

  it('passes a tall row at the tall row’s own midpoint', () => {
    const mixed = [40, 120, 40];
    // 60 clears half of the 120-tall row below; 50 does not.
    expect(dropIndexFor(mixed, 0, 50)).toBe(0);
    expect(dropIndexFor(mixed, 0, 61)).toBe(1);
  });

  it('cannot be dragged off either end', () => {
    expect(dropIndexFor(even, 0, -900)).toBe(0);
    expect(dropIndexFor(even, 3, 900)).toBe(3);
  });

  it('copes with an empty list and an out-of-range start', () => {
    expect(dropIndexFor([], 0, 40)).toBe(0);
    expect(dropIndexFor(even, 99, 0)).toBe(3);
    expect(dropIndexFor(even, -4, 0)).toBe(0);
  });
});

describe('slideOffset', () => {
  it('opens a gap below when a row is dragged down', () => {
    // 'a' (index 0) heading for slot 2: b and c come up one, d stays.
    expect([0, 1, 2, 3].map((i) => slideOffset(i, 0, 2, 60))).toEqual([0, -60, -60, 0]);
  });

  it('opens a gap above when a row is dragged up', () => {
    expect([0, 1, 2, 3].map((i) => slideOffset(i, 3, 1, 60))).toEqual([0, 60, 60, 0]);
  });

  it('moves nothing when the row has not changed slots', () => {
    expect([0, 1, 2, 3].map((i) => slideOffset(i, 2, 2, 60))).toEqual([0, 0, 0, 0]);
  });
});
