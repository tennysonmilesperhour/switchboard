import { describe, expect, test } from 'vitest';
import { dueReminders } from './reminders';

const NOW = new Date('2026-07-06T12:00:00Z');

function base(overrides: Partial<Parameters<typeof dueReminders>[0]> = {}) {
  return {
    status: 'confirmed' as const,
    reminders_enabled: true,
    reminded_day_before_at: null,
    reminded_soon_at: null,
    starts_at: null,
    ...overrides,
  };
}

function inHours(h: number): string {
  return new Date(NOW.getTime() + h * 3_600_000).toISOString();
}

describe('dueReminders', () => {
  test('12h out → day_before only', () => {
    expect(dueReminders(base({ starts_at: inHours(12) }), NOW)).toEqual(['day_before']);
  });

  test('2h out → soon only', () => {
    expect(dueReminders(base({ starts_at: inHours(2) }), NOW)).toEqual(['soon']);
  });

  test('3 days out → nothing yet', () => {
    expect(dueReminders(base({ starts_at: inHours(72) }), NOW)).toEqual([]);
  });

  test('already in the past → nothing', () => {
    expect(dueReminders(base({ starts_at: inHours(-1) }), NOW)).toEqual([]);
  });

  test('day_before does not re-fire once marked', () => {
    expect(
      dueReminders(
        base({ starts_at: inHours(12), reminded_day_before_at: inHours(-1) }),
        NOW,
      ),
    ).toEqual([]);
  });

  test('soon still fires even if day_before already went out', () => {
    expect(
      dueReminders(
        base({ starts_at: inHours(2), reminded_day_before_at: inHours(-10) }),
        NOW,
      ),
    ).toEqual(['soon']);
  });

  test('reminders disabled → nothing', () => {
    expect(
      dueReminders(base({ starts_at: inHours(12), reminders_enabled: false }), NOW),
    ).toEqual([]);
  });

  test('draft / cancelled events are never reminded', () => {
    expect(
      dueReminders(base({ starts_at: inHours(12), status: 'cancelled' }), NOW),
    ).toEqual([]);
  });

  test('no start time → nothing', () => {
    expect(dueReminders(base({ starts_at: null }), NOW)).toEqual([]);
  });
});
