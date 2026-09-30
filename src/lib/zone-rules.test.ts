import { describe, expect, it } from 'vitest';
import {
  defaultZoneEnd,
  ilikeTerm,
  parseZoneEnd,
  zoneIsActive,
  zoneRequestState,
  ZONE_MAX_DAYS,
} from './zone-rules';

const NOW = Date.parse('2026-09-29T12:00:00Z');
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('where someone outside a private zone stands (D10)', () => {
  it('has nothing to show before they ask', () => {
    expect(zoneRequestState(null, NOW)).toEqual({ kind: 'none' });
  });

  it('shows a waiting request as waiting', () => {
    expect(
      zoneRequestState({ status: 'pending', asks: 1, created_at: iso(NOW), decided_at: null }, NOW),
    ).toEqual({ kind: 'pending' });
  });

  it('tells a denied requester when they may ask again', () => {
    const decided = NOW - 2 * DAY;
    expect(
      zoneRequestState(
        { status: 'denied', asks: 1, created_at: iso(decided - DAY), decided_at: iso(decided) },
        NOW,
      ),
    ).toEqual({ kind: 'wait', reason: 'denied', retryAfter: iso(decided + 30 * DAY) });
  });

  it('offers the one new ask once 30 days have passed', () => {
    expect(
      zoneRequestState(
        { status: 'removed', asks: 1, created_at: iso(NOW - 90 * DAY), decided_at: iso(NOW - 31 * DAY) },
        NOW,
      ),
    ).toEqual({ kind: 'reask', reason: 'removed' });
  });

  it('closes after the second decision, however long ago', () => {
    expect(
      zoneRequestState(
        { status: 'denied', asks: 2, created_at: iso(NOW - 400 * DAY), decided_at: iso(NOW - 300 * DAY) },
        NOW,
      ),
    ).toEqual({ kind: 'closed', reason: 'denied' });
  });

  it('treats someone let in who has since left as free to ask', () => {
    expect(
      zoneRequestState({ status: 'approved', asks: 1, created_at: iso(NOW), decided_at: iso(NOW) }, NOW),
    ).toEqual({ kind: 'none' });
  });
});

describe('zone end dates (D23)', () => {
  it('defaults to a week out', () => {
    expect(defaultZoneEnd(NOW)).toBe(iso(NOW + 7 * DAY));
  });

  it('reads a chosen day as the end of that day', () => {
    expect(parseZoneEnd('2026-10-05', NOW)).toBe('2026-10-05T23:59:59.000Z');
  });

  it('refuses a past, unreadable, or far-future end', () => {
    expect(parseZoneEnd('2026-09-01', NOW)).toBeNull();
    expect(parseZoneEnd('soon', NOW)).toBeNull();
    expect(parseZoneEnd('', NOW)).toBeNull();
    expect(parseZoneEnd(iso(NOW + (ZONE_MAX_DAYS + 1) * DAY), NOW)).toBeNull();
    expect(parseZoneEnd(42, NOW)).toBeNull();
  });

  it('knows an ended zone from a running one', () => {
    expect(zoneIsActive(iso(NOW + DAY), NOW)).toBe(true);
    expect(zoneIsActive(iso(NOW - 1), NOW)).toBe(false);
  });
});

describe('search terms', () => {
  it('matches a typed % or _ literally', () => {
    expect(ilikeTerm('100%_off')).toBe('100\\%\\_off');
  });

  it('drops the characters PostgREST filters reserve, and caps the length', () => {
    expect(ilikeTerm('a,(b)')).toBe('a  b');
    expect(ilikeTerm('x'.repeat(200))).toHaveLength(60);
  });
});
