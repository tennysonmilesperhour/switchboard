import { describe, expect, test } from 'vitest';
import {
  nextOccurrence,
  nextOccurrenceAfter,
  normalizeCustomInterval,
  recurrenceLabel,
} from './recurrence';

describe('nextOccurrence', () => {
  const base = new Date('2026-07-10T18:00:00Z');

  test('none never produces a date', () => {
    expect(nextOccurrence(base, 'none')).toBeNull();
  });

  test('daily / weekly / biweekly add fixed days, preserving time', () => {
    expect(nextOccurrence(base, 'daily')?.toISOString()).toBe('2026-07-11T18:00:00.000Z');
    expect(nextOccurrence(base, 'weekly')?.toISOString()).toBe('2026-07-17T18:00:00.000Z');
    expect(nextOccurrence(base, 'biweekly')?.toISOString()).toBe('2026-07-24T18:00:00.000Z');
  });

  test('monthly advances one calendar month', () => {
    expect(nextOccurrence(base, 'monthly')?.toISOString()).toBe('2026-08-10T18:00:00.000Z');
  });

  test('monthly clamps the day for short months', () => {
    const jan31 = new Date('2026-01-31T09:00:00Z');
    // Feb 2026 has 28 days → clamps to the 28th, not March 3.
    expect(nextOccurrence(jan31, 'monthly')?.toISOString()).toBe('2026-02-28T09:00:00.000Z');
  });

  test('custom uses the interval, and rejects an unusable one', () => {
    expect(nextOccurrence(base, 'custom', 3)?.toISOString()).toBe('2026-07-13T18:00:00.000Z');
    expect(nextOccurrence(base, 'custom', 0)).toBeNull();
    expect(nextOccurrence(base, 'custom', null)).toBeNull();
  });
});

describe('nextOccurrenceAfter', () => {
  test('rolls a past weekly plan forward to the upcoming slot', () => {
    const lastGameNight = new Date('2026-07-01T00:00:00Z');
    const now = new Date('2026-07-20T00:00:00Z');
    // 07-08, 07-15 are still <= now; first future is 07-22.
    expect(
      nextOccurrenceAfter(lastGameNight, 'weekly', null, now)?.toISOString(),
    ).toBe('2026-07-22T00:00:00.000Z');
  });

  test('a plan still in the future yields its immediate next occurrence', () => {
    const upcoming = new Date('2026-08-01T00:00:00Z');
    const now = new Date('2026-07-20T00:00:00Z');
    expect(
      nextOccurrenceAfter(upcoming, 'weekly', null, now)?.toISOString(),
    ).toBe('2026-08-08T00:00:00.000Z');
  });

  test('monthly rolls forward month by month', () => {
    const start = new Date('2026-01-15T00:00:00Z');
    const now = new Date('2026-06-01T00:00:00Z');
    expect(
      nextOccurrenceAfter(start, 'monthly', null, now)?.toISOString(),
    ).toBe('2026-06-15T00:00:00.000Z');
  });

  test('a plan on the 31st comes back to the 31st after a short month', () => {
    const start = new Date('2026-01-31T09:00:00Z');
    const now = new Date('2026-03-15T00:00:00Z');
    // Stepping from the clamped Feb 28 used to land on Mar 28 and stay there.
    expect(
      nextOccurrenceAfter(start, 'monthly', null, now)?.toISOString(),
    ).toBe('2026-03-31T09:00:00.000Z');
  });

  test('never returns a date at or before `after`, even when the guard runs out', () => {
    // 521 daily steps from June 2024 still end in November 2025.
    const start = new Date('2024-06-01T18:00:00Z');
    const now = new Date('2026-09-30T12:00:00Z');
    expect(nextOccurrenceAfter(start, 'daily', null, now)).toBeNull();
    expect(nextOccurrenceAfter(start, 'custom', 1, now)).toBeNull();
  });
});

describe('normalizeCustomInterval', () => {
  test('clamps and rounds into the permitted range', () => {
    expect(normalizeCustomInterval(3)).toBe(3);
    expect(normalizeCustomInterval(3.4)).toBe(3);
    expect(normalizeCustomInterval(0)).toBeNull();
    expect(normalizeCustomInterval(-2)).toBeNull();
    expect(normalizeCustomInterval(9999)).toBe(365);
    expect(normalizeCustomInterval(null)).toBeNull();
  });
});

describe('recurrenceLabel', () => {
  test('fixed cadences', () => {
    expect(recurrenceLabel('none')).toBeNull();
    expect(recurrenceLabel('weekly')).toBe('Repeats weekly');
    expect(recurrenceLabel('biweekly')).toBe('Repeats every 2 weeks');
    expect(recurrenceLabel('monthly')).toBe('Repeats monthly');
  });

  test('custom collapses to friendly words when it can', () => {
    expect(recurrenceLabel('custom', 1)).toBe('Repeats daily');
    expect(recurrenceLabel('custom', 7)).toBe('Repeats weekly');
    expect(recurrenceLabel('custom', 10)).toBe('Repeats every 10 days');
  });
});
