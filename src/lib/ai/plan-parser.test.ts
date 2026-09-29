import { describe, it, expect } from 'vitest';
import { extractDate, extractTime, extractMode, localToday, weekdayOf } from './plan-parser';

// A fixed reference point: Wednesday, 2026-07-15, in the host's own zone.
const NOW = '2026-07-15';

describe('localToday', () => {
  // 7pm on Tuesday the 14th in Los Angeles is already 02:00 on Wednesday UTC.
  const EVENING_IN_LA = new Date('2026-07-15T02:00:00Z');

  it('reads the date in the host’s zone, not the server’s (G26)', () => {
    expect(localToday(EVENING_IN_LA, 'America/Los_Angeles')).toBe('2026-07-14');
    expect(localToday(EVENING_IN_LA, 'UTC')).toBe('2026-07-15');
    expect(localToday(EVENING_IN_LA, 'Asia/Tokyo')).toBe('2026-07-15');
  });

  it('makes "tonight" and "tomorrow" the host’s', () => {
    const today = localToday(EVENING_IN_LA, 'America/Los_Angeles');
    expect(extractDate('drinks tonight', today)).toBe('2026-07-14');
    expect(extractDate('coffee tomorrow', today)).toBe('2026-07-15');
  });

  it('falls back to UTC for a missing or unknown zone', () => {
    expect(localToday(EVENING_IN_LA, null)).toBe('2026-07-15');
    expect(localToday(EVENING_IN_LA, 'Not/AZone')).toBe('2026-07-15');
  });

  it('names the weekday for the model’s prompt', () => {
    expect(weekdayOf('2026-07-15')).toBe('Wednesday');
    expect(weekdayOf('2026-07-14')).toBe('Tuesday');
  });
});

describe('extractDate', () => {
  it('resolves "today" and "tonight" to now', () => {
    expect(extractDate('grab dinner today', NOW)).toBe('2026-07-15');
    expect(extractDate('drinks tonight', NOW)).toBe('2026-07-15');
  });

  it('resolves "tomorrow"', () => {
    expect(extractDate('coffee tomorrow morning', NOW)).toBe('2026-07-16');
  });

  it('resolves the next occurrence of a weekday', () => {
    // Wed -> Friday is +2 days.
    expect(extractDate('lunch on friday', NOW)).toBe('2026-07-17');
    // Wed -> Monday wraps to next week.
    expect(extractDate('hike monday', NOW)).toBe('2026-07-20');
  });

  it('crosses a month end', () => {
    expect(extractDate('brunch tomorrow', '2026-07-31')).toBe('2026-08-01');
    expect(extractDate('dinner friday', '2026-12-30')).toBe('2027-01-01');
  });

  it('treats the same weekday as a week out, not today', () => {
    expect(extractDate('call wednesday', NOW)).toBe('2026-07-22');
  });

  it('pushes "next <weekday>" a further week', () => {
    // Nearest Friday is +2 (within 6 days), so "next friday" is +9.
    expect(extractDate('dinner next friday', NOW)).toBe('2026-07-24');
  });

  it('reads an explicit ISO date', () => {
    expect(extractDate('party on 2026-08-01', NOW)).toBe('2026-08-01');
  });

  it('returns null when there is no date phrase', () => {
    expect(extractDate('just a chill hang', NOW)).toBeNull();
  });
});

describe('extractTime', () => {
  it('parses 12-hour times with am/pm', () => {
    expect(extractTime('coffee at 7pm')).toBe('19:00');
    expect(extractTime('brunch 10:30 am')).toBe('10:30');
    expect(extractTime('midnight snack 12am')).toBe('00:00');
    expect(extractTime('lunch 12pm')).toBe('12:00');
  });

  it('parses 24-hour times', () => {
    expect(extractTime('meet at 19:00')).toBe('19:00');
    expect(extractTime('standup 09:30')).toBe('09:30');
  });

  it('assumes evening for a bare social "at N"', () => {
    expect(extractTime('dinner at 8')).toBe('20:00');
    expect(extractTime('meet at 9')).toBe('21:00');
  });

  it('returns null with no time', () => {
    expect(extractTime('sometime this week')).toBeNull();
  });
});

describe('extractMode', () => {
  it('detects all-at-once', () => {
    expect(extractMode('invite everyone')).toBe('all_at_once');
    expect(extractMode('send it to all of them at once')).toBe('all_at_once');
  });

  it('detects waves/group', () => {
    expect(extractMode('invite them in waves')).toBe('group');
    expect(extractMode('do it in stages')).toBe('group');
  });

  it('defaults to individual (cascade)', () => {
    expect(extractMode('ask Alex first, then Jordan')).toBe('individual');
    expect(extractMode('one at a time please')).toBe('individual');
    expect(extractMode('coffee downtown')).toBe('individual');
  });
});
