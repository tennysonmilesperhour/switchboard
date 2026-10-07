import { describe, expect, it } from 'vitest';
import {
  bearingDegrees,
  compassDirection,
  describeGap,
  EXACT_HEARTBEAT_MS,
  EXACT_MIN_GAP_MS,
  freshness,
  minutesLeft,
  shouldSendExact,
  walkingDirectionsUrl,
} from './exact-location';

const HERE = { lat: 39.7392, lng: -104.9903 };
/** About 111 m due north. */
const NORTH = { lat: 39.7402, lng: -104.9903 };
/** About 86 m due east at this latitude. */
const EAST = { lat: 39.7392, lng: -104.9893 };

describe('shouldSendExact', () => {
  it('sends the first fix', () => {
    expect(shouldSendExact(null, HERE, 0)).toBe(true);
  });

  it('waits out the minimum gap even after a big move', () => {
    expect(shouldSendExact({ point: HERE, at: 0 }, NORTH, EXACT_MIN_GAP_MS - 1)).toBe(false);
  });

  it('sends a real move once the gap is up', () => {
    expect(shouldSendExact({ point: HERE, at: 0 }, NORTH, EXACT_MIN_GAP_MS)).toBe(true);
  });

  it('ignores GPS jitter of a metre or two', () => {
    const jitter = { lat: HERE.lat + 0.00001, lng: HERE.lng };
    expect(shouldSendExact({ point: HERE, at: 0 }, jitter, 30_000)).toBe(false);
  });

  it('sends a heartbeat when standing still', () => {
    expect(shouldSendExact({ point: HERE, at: 0 }, HERE, EXACT_HEARTBEAT_MS)).toBe(true);
  });
});

describe('direction', () => {
  it('reads north and east correctly', () => {
    expect(compassDirection(bearingDegrees(HERE, NORTH))).toBe('north');
    expect(compassDirection(bearingDegrees(HERE, EAST))).toBe('east');
    expect(compassDirection(bearingDegrees(NORTH, HERE))).toBe('south');
  });

  it('wraps around north', () => {
    expect(compassDirection(359)).toBe('north');
    expect(compassDirection(-10)).toBe('north');
    expect(compassDirection(225)).toBe('southwest');
  });
});

describe('describeGap', () => {
  it('says how far and which way', () => {
    expect(describeGap(HERE, NORTH, 'Ben')).toBe('Ben is about 110 m north of you.');
  });

  it('does not invent a direction when they are right there', () => {
    expect(describeGap(HERE, { lat: HERE.lat + 0.00005, lng: HERE.lng }, 'Ben')).toBe(
      'Ben is right around you.',
    );
  });
});

describe('walkingDirectionsUrl', () => {
  it('opens Apple Maps on Apple devices and Google Maps elsewhere', () => {
    expect(walkingDirectionsUrl(NORTH, true)).toBe(
      'https://maps.apple.com/?daddr=39.740200,-104.990300&dirflg=w',
    );
    expect(walkingDirectionsUrl(NORTH, false)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=39.740200,-104.990300&travelmode=walking',
    );
  });
});

describe('clock text', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  it('says how fresh a point is', () => {
    expect(freshness('2026-10-08T11:59:52Z', now)).toBe('8 s ago');
    expect(freshness('2026-10-08T11:57:00Z', now)).toBe('3 min ago');
  });
  it('counts minutes left and never goes negative', () => {
    expect(minutesLeft('2026-10-08T12:30:00Z', now)).toBe(30);
    expect(minutesLeft('2026-10-08T11:00:00Z', now)).toBe(0);
  });
});
