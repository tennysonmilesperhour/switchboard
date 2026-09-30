import { describe, expect, it } from 'vitest';

import {
  digestBody,
  isDigestHour,
  isDueForDigest,
  unmutedDigestLines,
} from '@/lib/server/digest';

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
    expect(digestBody([{ kind: 'event_invite', items: 1, latestTitle: null }])).toBe(
      '1 invitation',
    );
  });

  it('joins several kinds with an "and" rather than commas throughout', () => {
    expect(
      digestBody([
        { kind: 'room_message', items: 2, latestTitle: null },
        { kind: 'event_invite', items: 1, latestTitle: null },
        { kind: 'rsvp_accepted', items: 4, latestTitle: null },
      ]),
    ).toBe('2 new messages, 1 invitation and 4 answers');
  });

  it('names the kinds notifyUsers actually writes', () => {
    // It used to be keyed by names no sender used, so a real day read
    // "2 updates, 1 update and 3 updates".
    expect(
      digestBody([
        { kind: 'event_comment', items: 2, latestTitle: null },
        { kind: 'poll_suggestion', items: 1, latestTitle: null },
        { kind: 'event_updated', items: 3, latestTitle: null },
      ]),
    ).toBe('2 new comments, 1 new idea and 3 plan updates');
  });

  it('counts kinds that read the same together', () => {
    expect(
      digestBody([
        { kind: 'event_updated', items: 1, latestTitle: null },
        { kind: 'event_date_set', items: 2, latestTitle: null },
        { kind: 'something_new', items: 1, latestTitle: null },
        { kind: 'something_else', items: 1, latestTitle: null },
      ]),
    ).toBe('3 plan updates and 2 updates');
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

  it('reads an unknown zone as UTC instead of throwing out of the sweep', () => {
    // The zone is client-supplied; a RangeError here stopped every digest
    // after that person's row.
    expect(() => isDigestHour(NOON_UTC, 12, 'Not/AZone')).not.toThrow();
    expect(isDigestHour(NOON_UTC, 12, 'Not/AZone')).toBe(true);
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

describe('unmutedDigestLines', () => {
  const lines = [
    { kind: 'event_updated', items: 2, latestTitle: null },
    { kind: 'room_message', items: 3, latestTitle: null },
    { kind: 'something_new', items: 1, latestTitle: null },
  ];

  it('leaves out a category the person muted, so it cannot return as a summary', () => {
    expect(
      unmutedDigestLines(lines, { notify_plans: false, notify_messages: true }).map(
        (line) => line.kind,
      ),
    ).toEqual(['room_message', 'something_new']);
  });

  it('treats an unset preference as on, like the per-item push', () => {
    expect(unmutedDigestLines(lines, { notify_plans: null })).toHaveLength(3);
  });

  it('keeps only what plans they are in said, for someone on sabbatical (D6)', () => {
    const withInvite = [...lines, { kind: 'event_invite', items: 1, latestTitle: null }];
    expect(
      unmutedDigestLines(withInvite, { sabbatical: true }).map((line) => line.kind),
    ).toEqual(['event_updated', 'room_message']);
    expect(unmutedDigestLines(withInvite, { sabbatical: false })).toHaveLength(4);
  });
});
