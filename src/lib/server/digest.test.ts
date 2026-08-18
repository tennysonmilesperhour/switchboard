import { describe, expect, it } from 'vitest';

import { digestBody, isDigestHour, isDueForDigest } from '@/lib/server/digest';

describe('digestBody', () => {
  it('says nothing at all when there is nothing to say', () => {
    // A digest that arrives to report an empty day is exactly the interruption
    // the feature exists to remove, and the thing that gets it muted.
    expect(digestBody([])).toBeNull();
    expect(digestBody([{ kind: 'room_message', items: 0, latestTitle: null }])).toBeNull();
  });

  it('reads as a sentence for one kind', () => {
    expect(digestBody([{ kind: 'room_message', items: 3, latestTitle: 'x' }])).toBe(
      '3 new messages',
    );
  });

  it('uses the singular for one', () => {
    expect(digestBody([{ kind: 'invite', items: 1, latestTitle: null }])).toBe(
      '1 invitation',
    );
  });

  it('joins several kinds with an "and" rather than commas throughout', () => {
    expect(
      digestBody([
        { kind: 'room_message', items: 2, latestTitle: null },
        { kind: 'invite', items: 1, latestTitle: null },
        { kind: 'rsvp', items: 4, latestTitle: null },
      ]),
    ).toBe('2 new messages, 1 invitation and 4 answers');
  });

  it('falls back to a plain word for a kind it does not know', () => {
    // A new notification kind must not make the digest read as broken.
    expect(digestBody([{ kind: 'something_new', items: 2, latestTitle: null }])).toBe(
      '2 updates',
    );
  });
});

describe('isDigestHour', () => {
  const NOON_UTC = new Date('2026-08-18T12:00:00Z');

  it('is that hour in the reader’s own zone, not the server’s', () => {
    // Someone in Auckland should not be summarised at midnight because the
    // server is in UTC.
    expect(isDigestHour(NOON_UTC, 12, 'UTC')).toBe(true);
    expect(isDigestHour(NOON_UTC, 8, 'America/New_York')).toBe(true);
    expect(isDigestHour(NOON_UTC, 12, 'America/New_York')).toBe(false);
  });

  it('falls back to UTC for a profile with no zone', () => {
    expect(isDigestHour(NOON_UTC, 12, null)).toBe(true);
  });

  it('handles midnight without treating hour 0 as unset', () => {
    expect(isDigestHour(new Date('2026-08-18T00:00:00Z'), 0, 'UTC')).toBe(true);
  });
});

describe('isDueForDigest', () => {
  const NOW = new Date('2026-08-18T08:00:00Z');

  it('sends the first one', () => {
    expect(isDueForDigest(NOW, null)).toBe(true);
  });

  it('does not send a second within the day', () => {
    // The once-a-day guarantee lives here rather than in the cron schedule: a
    // job that fires twice, or retries, must not produce two digests.
    expect(isDueForDigest(NOW, '2026-08-18T07:00:00Z')).toBe(false);
  });

  it('sends again the next day, allowing for a slightly early sweep', () => {
    // 20h rather than 24h so a digest at 08:00 is not skipped because
    // yesterday's went out at 08:05.
    expect(isDueForDigest(NOW, '2026-08-17T08:05:00Z')).toBe(true);
  });
});
