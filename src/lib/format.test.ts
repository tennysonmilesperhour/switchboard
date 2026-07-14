import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDate } from './format';

describe('formatDateTime', () => {
  // The reported bug: a host in US Mountain (MDT, UTC-6 in July) sets a plan for
  // "tomorrow at 6pm". The wizard stores that as the instant 18:00 MDT == 00:00Z
  // the next day. Rendered on the server (no viewer zone) it fell back to UTC and
  // unfurled as "12:00 AM" the following day. Given the plan's own zone it must
  // read 6:00 PM on the intended day.
  const sixPmMountain = '2026-07-15T00:00:00.000Z';

  it('renders the instant in the event’s zone, not the server’s UTC', () => {
    const out = formatDateTime(sixPmMountain, 'America/Denver');
    expect(out).toContain('6:00');
    expect(out).toContain('PM');
    expect(out).toContain('Jul 14');
    // The zone label removes any doubt about whose clock it is.
    expect(out).toContain('MDT');
    // The exact midnight-in-UTC bug must not resurface.
    expect(out).not.toContain('12:00');
    expect(out).not.toContain('Jul 15');
  });

  it('honors a different zone for the same instant', () => {
    // 00:00Z is 8:00 PM the prior evening in Eastern (EDT, UTC-4 in July).
    const out = formatDateTime(sixPmMountain, 'America/New_York');
    expect(out).toContain('8:00');
    expect(out).toContain('PM');
    expect(out).toContain('EDT');
  });

  it('falls back to the runtime zone (no throw) on an unknown zone', () => {
    expect(() => formatDateTime(sixPmMountain, 'Not/AZone')).not.toThrow();
    // Still renders the instant, just without the bad zone applied.
    expect(formatDateTime(sixPmMountain, 'Not/AZone')).not.toBe('');
  });

  it('omits the zone label entirely when none is given', () => {
    // No zone → prior behavior (runtime zone), and no zone label appended.
    expect(formatDateTime(sixPmMountain)).not.toContain('MDT');
  });

  it('returns a placeholder for an undated plan', () => {
    expect(formatDateTime(null, 'America/Chicago')).toBe('Time TBD');
  });
});

describe('formatDate', () => {
  it('resolves the calendar day in the event’s zone', () => {
    // Midnight UTC is still the 14th in Central — the date must not jump a day.
    const out = formatDate('2026-07-15T00:00:00.000Z', 'America/Chicago');
    expect(out).toContain('July 14');
  });

  it('falls back gracefully on an unknown zone', () => {
    expect(() => formatDate('2026-07-15T00:00:00.000Z', 'Not/AZone')).not.toThrow();
  });

  it('returns a placeholder for a dateless plan', () => {
    expect(formatDate(null)).toBe('Date TBD');
  });
});
