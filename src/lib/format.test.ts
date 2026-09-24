import { describe, it, expect } from 'vitest';
import { formatDateTime, formatDate, formatDateTimeRange } from './format';

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

describe('formatDateTimeRange', () => {
  const start = '2026-07-31T18:00:00.000Z';
  const end = '2026-07-31T21:00:00.000Z';

  it('labels the zone once across the range, not on both ends', () => {
    const out = formatDateTimeRange(start, end, 'America/Los_Angeles');
    expect(out).toBe('Fri, Jul 31, 11:00 AM – 2:00 PM PDT');
    expect(out.match(/PDT/g)).toHaveLength(1);
  });

  it('falls back to the start line when there is no end', () => {
    expect(formatDateTimeRange(start, null, 'America/Los_Angeles')).toBe(
      formatDateTime(start, 'America/Los_Angeles'),
    );
  });

  it('is Time TBD when there is no start, even with an end', () => {
    expect(formatDateTimeRange(null, end, 'America/Los_Angeles')).toBe('Time TBD');
  });

  it('survives a malformed zone rather than throwing', () => {
    expect(() => formatDateTimeRange(start, end, 'Not/AZone')).not.toThrow();
  });

  it('keeps a late night compact: the end is the next morning', () => {
    // Fri 9 PM – Sat 1 AM in Los Angeles.
    const out = formatDateTimeRange(
      '2026-09-26T04:00:00.000Z',
      '2026-09-26T08:00:00.000Z',
      'America/Los_Angeles',
    );
    expect(out).toBe('Fri, Sep 25, 9:00 PM – 1:00 AM PDT');
  });

  /**
   * A bare end time after a Friday start read as ending before it began: the
   * weekend below rendered "Fri, Sep 25, 5:00 PM – 11:00 AM PDT".
   */
  it('names the end day when a plan runs over more than a night', () => {
    const out = formatDateTimeRange(
      '2026-09-26T00:00:00.000Z',
      '2026-09-27T18:00:00.000Z',
      'America/Los_Angeles',
    );
    expect(out).toBe('Fri, Sep 25, 5:00 PM – Sun, Sep 27, 11:00 AM PDT');
    expect(out.match(/PDT/g)).toHaveLength(1);
  });
});
