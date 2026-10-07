import { describe, expect, it } from 'vitest';
import { SWIPE_THRESHOLD, swipeDecision } from './SwipeDeck';

describe('swipeDecision', () => {
  it('decides only past the threshold, in the direction dragged', () => {
    expect(swipeDecision(SWIPE_THRESHOLD)).toBe('right');
    expect(swipeDecision(-SWIPE_THRESHOLD)).toBe('left');
    expect(swipeDecision(SWIPE_THRESHOLD - 1)).toBeNull();
    expect(swipeDecision(-(SWIPE_THRESHOLD - 1))).toBeNull();
    expect(swipeDecision(0)).toBeNull();
  });
});
