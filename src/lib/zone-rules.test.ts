import { describe, expect, it } from 'vitest';
import {
  defaultZoneEnd,
  ilikeTerm,
  parseZoneEnd,
  zoneEndDay,
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

describe('a picked end date reads back as the same day (D23)', () => {
  const localDay = (iso: string) => {
    const date = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };

  function inZone<T>(zone: string, run: () => T): T {
    const previous = process.env.TZ;
    process.env.TZ = zone;
    try {
      return run();
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }

  const zones = [
    'America/Los_Angeles',
    'Pacific/Pago_Pago',
    'UTC',
    'Asia/Tokyo',
    'Pacific/Kiritimati',
  ];

  it.each(zones)('in %s the form shows the day that was picked', (zone) => {
    inZone(zone, () => {
      for (const picked of ['2026-10-05', '2026-11-01', '2027-03-14']) {
        const saved = parseZoneEnd(picked, NOW);
        expect(saved).not.toBeNull();
        expect(zoneEndDay(saved!)).toBe(picked);
      }
    });
  });

  it('reading the stored end in the browser’s own calendar was a day late east of UTC', () => {
    const saved = parseZoneEnd('2026-10-05', NOW)!;
    expect(inZone('America/Los_Angeles', () => localDay(saved))).toBe('2026-10-05');
    expect(inZone('Asia/Tokyo', () => localDay(saved))).toBe('2026-10-06');
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
