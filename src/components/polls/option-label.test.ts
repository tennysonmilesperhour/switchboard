import { describe, expect, it } from 'vitest';
import { gridSlots } from '@/lib/availability';
import { pollHint, pollOptionDetail, pollOptionLabel } from './option-label';

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

describe('pollOptionLabel far from Greenwich', () => {
  it('prints the slot’s own day, even for a plan east of UTC+12', () => {
    // Formatting noon UTC in Kiritimati (UTC+14) is 2am the next day, which
    // put every option a day late.
    expect(pollOptionLabel('2026-10-02T17:00:00.000Z', 'Pacific/Kiritimati')).toBe(
      'Friday, October 2 · evening',
    );
    expect(pollOptionLabel('2026-10-02T08:00:00.000Z', 'Pacific/Pago_Pago')).toBe(
      'Friday, October 2 · morning',
    );
  });

  it('reads the slot as PostgREST spells it, too', () => {
    expect(pollOptionLabel('2026-10-02T22:00:00+00:00')).toBe('Friday, October 2 · late');
  });
});

describe('pollOptionDetail', () => {
  it('hides the machine copy of a grid slot and keeps what people wrote', () => {
    expect(pollOptionDetail('2026-10-02T17:00:00+00:00')).toBeNull();
    expect(pollOptionDetail('  ')).toBeNull();
    expect(pollOptionDetail(null)).toBeNull();
    expect(pollOptionDetail(' Bring a jacket ')).toBe('Bring a jacket');
  });
});

describe('pollHint', () => {
  it('gives the host a way forward when a poll closed with nothing on it', () => {
    expect(pollHint({ phase: 'decided', decided: false, isHost: true, ideas: 0 })).toMatch(/Edit plan/);
    expect(pollHint({ phase: 'decided', decided: false, isHost: false, ideas: 0 })).toMatch(/host will settle/);
  });

  it('keeps the existing lines everywhere else', () => {
    expect(pollHint({ phase: 'decided', decided: true, isHost: true, ideas: 3 })).toBe('The group has decided.');
    expect(pollHint({ phase: 'decided', decided: false, isHost: true, ideas: 3 })).toBe(
      'Voting is closed - choose the winner below.',
    );
    expect(pollHint({ phase: 'runoff', decided: false, isHost: false, ideas: 2 })).toBe(
      'Final runoff - pick between the finalists.',
    );
    expect(pollHint({ phase: 'voting', decided: false, isHost: false, ideas: 2 })).toMatch(/privately/);
  });
});
