import { describe, expect, it } from 'vitest';
import { planEnd, sameInstant } from './plan-time';

/** A local wall-clock time as the ISO instant the wizard would send. */
const at = (local: string) => new Date(local).toISOString();

describe('planEnd', () => {
  it('ends the same day when the end is later than the start', () => {
    expect(planEnd('2026-10-03', '18:00', '21:30')).toEqual({
      endsAt: at('2026-10-03T21:30'),
      nextDay: false,
      sameAsStart: false,
    });
  });

  /**
   * The case that could not be entered at all: a 9 PM party that ends at 1 AM
   * was refused as "ends before it starts".
   */
  it('rolls an end at or before the start onto the next morning', () => {
    expect(planEnd('2026-10-03', '21:00', '01:00')).toEqual({
      endsAt: at('2026-10-04T01:00'),
      nextDay: true,
      sameAsStart: false,
    });
  });

  it('rolls across a month boundary', () => {
    expect(planEnd('2026-10-31', '22:00', '02:00').endsAt).toBe(at('2026-11-01T02:00'));
  });

  it('refuses an end equal to the start rather than guessing 0 or 24 hours', () => {
    const result = planEnd('2026-10-03', '20:00', '20:00');
    expect(result.sameAsStart).toBe(true);
    expect(result.nextDay).toBe(false);
  });

  it('has no end when no end time or no date was given', () => {
    expect(planEnd('2026-10-03', '20:00', '')).toEqual({
      endsAt: null,
      nextDay: false,
      sameAsStart: false,
    });
    expect(planEnd('', '20:00', '22:00').endsAt).toBeNull();
  });
});

describe('sameInstant', () => {
  it('treats two spellings of one moment as the same', () => {
    // What PostgREST returns next to what the edit form sends.
    expect(sameInstant('2026-09-25T02:00:00+00:00', '2026-09-25T02:00:00.000Z')).toBe(true);
    expect(sameInstant('2026-09-24T19:00:00-07:00', '2026-09-25T02:00:00Z')).toBe(true);
  });

  it('sees a real change', () => {
    expect(sameInstant('2026-09-25T02:00:00+00:00', '2026-09-25T02:30:00.000Z')).toBe(false);
  });

  it('treats a missing time on both sides as unchanged, and on one side as a change', () => {
    expect(sameInstant(null, null)).toBe(true);
    expect(sameInstant(null, '')).toBe(true);
    expect(sameInstant(null, '2026-09-25T02:00:00Z')).toBe(false);
    expect(sameInstant('2026-09-25T02:00:00Z', undefined)).toBe(false);
  });
});
