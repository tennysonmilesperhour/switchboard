import { describe, expect, test } from 'vitest';
import { suggestWindow } from './windows';

const NOW = new Date('2026-07-03T12:00:00Z');

function inMinutes(minutes: number): Date {
  return new Date(NOW.getTime() + minutes * 60_000);
}

describe('suggestWindow', () => {
  test('event in 2 hours → 15 minute window', () => {
    expect(suggestWindow(inMinutes(120), NOW).windowMinutes).toBe(15);
  });

  test('event tonight (10h) → 1 hour window', () => {
    expect(suggestWindow(inMinutes(10 * 60), NOW).windowMinutes).toBe(60);
  });

  test('event in 2 days → 4 hour window', () => {
    expect(suggestWindow(inMinutes(2 * 24 * 60), NOW).windowMinutes).toBe(240);
  });

  test('event in 5 days → 1 day window', () => {
    expect(suggestWindow(inMinutes(5 * 24 * 60), NOW).windowMinutes).toBe(1440);
  });

  test('event in 2 weeks → 3 day window', () => {
    expect(suggestWindow(inMinutes(14 * 24 * 60), NOW).windowMinutes).toBe(3 * 1440);
  });

  test('event in 3 months → 1 week window', () => {
    expect(suggestWindow(inMinutes(90 * 24 * 60), NOW).windowMinutes).toBe(7 * 1440);
  });

  test('past event clamps to shortest window', () => {
    expect(suggestWindow(inMinutes(-60), NOW).windowMinutes).toBe(15);
  });
});
