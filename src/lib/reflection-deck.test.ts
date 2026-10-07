import { describe, expect, it } from 'vitest';
import {
  DECK_TAGS,
  SWIPE_VERDICT,
  cleanTags,
  impliedFeeling,
  isReflectable,
  swipeDirection,
} from './reflection-deck';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const base = { status: 'confirmed', starts_at: null, ends_at: null, happened_at: null };

describe('isReflectable', () => {
  it('waits a day after the start when nothing else says it is over', () => {
    expect(isReflectable({ ...base, starts_at: '2026-10-06T11:00:00Z' }, NOW)).toBe(true);
    expect(isReflectable({ ...base, starts_at: '2026-10-06T13:00:00Z' }, NOW)).toBe(false);
  });
  it('measures from the end when there is one', () => {
    const e = { ...base, starts_at: '2026-10-01T00:00:00Z', ends_at: '2026-10-07T00:00:00Z' };
    expect(isReflectable(e, NOW)).toBe(false);
  });
  it('offers a plan marked happened or past right away', () => {
    expect(isReflectable({ ...base, happened_at: '2026-10-07T11:00:00Z' }, NOW)).toBe(true);
    expect(isReflectable({ ...base, status: 'past' }, NOW)).toBe(true);
  });
  it('never offers cancelled or undated plans', () => {
    expect(isReflectable({ ...base, status: 'cancelled', starts_at: '2026-01-01T00:00:00Z' }, NOW)).toBe(false);
    expect(isReflectable(base, NOW)).toBe(false);
  });
});

describe('swipeDirection', () => {
  it('ignores short drags', () => {
    expect(swipeDirection(40, -30)).toBeNull();
  });
  it('maps each direction, longer axis winning', () => {
    expect(swipeDirection(120, 20)).toBe('right');
    expect(swipeDirection(-120, 20)).toBe('left');
    expect(swipeDirection(10, -140)).toBe('up');
    expect(swipeDirection(10, 140)).toBe('down');
    expect(swipeDirection(100, -130)).toBe('up');
  });
  it('gives each direction its own verdict', () => {
    expect(new Set(Object.values(SWIPE_VERDICT)).size).toBe(4);
  });
});

describe('cleanTags / impliedFeeling', () => {
  it('drops unknown and duplicate tags', () => {
    expect(cleanTags(['good-food', 'good-food', 'nope', 3])).toEqual(['good-food']);
    expect(cleanTags('good-food')).toEqual([]);
  });
  it('has unique tag keys', () => {
    expect(new Set(DECK_TAGS.map((t) => t.key)).size).toBe(DECK_TAGS.length);
  });
  it('implies an energy feeling only when the person went', () => {
    expect(impliedFeeling('loved')).toBe('filled');
    expect(impliedFeeling('disliked')).toBe('drained');
    expect(impliedFeeling('missed')).toBeNull();
  });
});
