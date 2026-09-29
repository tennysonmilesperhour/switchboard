import { describe, expect, it } from 'vitest';
import { gridSlots } from '@/lib/availability';
import { pollOptionLabel } from './option-label';

describe('pollOptionLabel', () => {
  it('reads a grid slot the way the availability grid labels it', () => {
    expect(pollOptionLabel('2026-10-02T17:00:00.000Z', 'America/Los_Angeles')).toBe(
      'Friday, October 2 · evening',
    );
    expect(pollOptionLabel('2026-10-03T08:00:00.000Z', 'UTC')).toBe(
      'Saturday, October 3 · morning',
    );
  });

  it('formats every slot the grid can hand to the poll', () => {
    for (const slot of gridSlots(new Date('2026-10-01T00:00:00Z'))) {
      expect(pollOptionLabel(slot, 'Europe/London')).toMatch(/^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2} · [a-z]+$/);
    }
  });

  it('leaves the group’s own words alone', () => {
    expect(pollOptionLabel('Pizza at Mario’s')).toBe('Pizza at Mario’s');
    expect(pollOptionLabel('2026-10-02')).toBe('2026-10-02');
    expect(pollOptionLabel('2026-10-02T19:30:00.000Z')).toBe('2026-10-02T19:30:00.000Z');
  });

  it('survives a malformed zone rather than breaking the poll', () => {
    expect(pollOptionLabel('2026-10-02T12:00:00.000Z', 'Not/AZone')).toBe(
      'Friday, October 2 · afternoon',
    );
  });
});
