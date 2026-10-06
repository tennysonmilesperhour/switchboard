import { describe, expect, test } from 'vitest';
import {
  coarsenCoordinate,
  distanceMeters,
  APPROXIMATE_FIX_M,
  formatDistance,
  isApproximateFix,
  isValidCoordinate,
  MOMENT_MATCH_RADIUS_M,
  nominatimSearchUrl,
  nominatimUrl,
  parseNominatimResult,
  parseNominatimResults,
  toMapPoint,
} from './geo';

describe('isValidCoordinate', () => {
  test('accepts a real coordinate', () => {
    expect(isValidCoordinate(40.7128, -74.006)).toBe(true);
  });

  test('rejects out-of-range values', () => {
    expect(isValidCoordinate(91, 0)).toBe(false);
    expect(isValidCoordinate(0, 181)).toBe(false);
  });

  test('rejects non-numbers, NaN, and null island', () => {
    expect(isValidCoordinate('40', '-74')).toBe(false);
    expect(isValidCoordinate(NaN, 5)).toBe(false);
    expect(isValidCoordinate(0, 0)).toBe(false);
  });
});

describe('toMapPoint', () => {
  test('returns a point for valid coordinates', () => {
    expect(toMapPoint(51.5074, -0.1278)).toEqual({ lat: 51.5074, lng: -0.1278 });
  });

  test('returns null when either coordinate is missing', () => {
    expect(toMapPoint(51.5074, null)).toBeNull();
    expect(toMapPoint(null, -0.1278)).toBeNull();
    expect(toMapPoint(undefined, undefined)).toBeNull();
  });
});

describe('nominatimUrl', () => {
  test('encodes the query and asks for a single json result', () => {
    const url = nominatimUrl('123 Main St, Springfield');
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain('q=123+Main+St%2C+Springfield');
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('limit=1');
  });
});

describe('parseNominatimResult', () => {
  test('reads lat/lon from the first result', () => {
    expect(
      parseNominatimResult([{ lat: '48.8584', lon: '2.2945' }, { lat: '1', lon: '1' }]),
    ).toEqual({ lat: 48.8584, lng: 2.2945 });
  });

  test('returns null for empty or malformed payloads', () => {
    expect(parseNominatimResult([])).toBeNull();
    expect(parseNominatimResult(null)).toBeNull();
    expect(parseNominatimResult([{ foo: 'bar' }])).toBeNull();
  });
});

describe('nominatimSearchUrl', () => {
  test('encodes the query and clamps the requested limit', () => {
    const url = nominatimSearchUrl('Café Luna', 5);
    expect(url).toContain('nominatim.openstreetmap.org/search');
    expect(url).toContain('q=Caf%C3%A9+Luna');
    expect(url).toContain('format=jsonv2');
    expect(url).toContain('limit=5');
    expect(nominatimSearchUrl('x', 99)).toContain('limit=10');
    expect(nominatimSearchUrl('x', 0)).toContain('limit=1');
  });
});

describe('parseNominatimResults', () => {
  test('maps named POIs to a short label plus full address', () => {
    expect(
      parseNominatimResults([
        { lat: '43.03', lon: '-87.97', name: 'Miller Park', display_name: 'Miller Park, Milwaukee, WI, USA' },
      ]),
    ).toEqual([
      { label: 'Miller Park', address: 'Miller Park, Milwaukee, WI, USA', lat: 43.03, lng: -87.97 },
    ]);
  });

  test('falls back to the first address component when name is absent', () => {
    expect(
      parseNominatimResults([{ lat: '40.0', lon: '-74.0', display_name: '123 Main St, Springfield, USA' }]),
    ).toEqual([
      { label: '123 Main St', address: '123 Main St, Springfield, USA', lat: 40, lng: -74 },
    ]);
  });

  test('skips entries without a usable coordinate and honors the limit', () => {
    const results = parseNominatimResults(
      [
        { lat: '0', lon: '0', name: 'Null Island' },
        { name: 'No coords' },
        { lat: '51.5', lon: '-0.12', name: 'London' },
        { lat: '48.85', lon: '2.29', name: 'Paris' },
      ],
      1,
    );
    expect(results).toEqual([{ label: 'London', address: 'London', lat: 51.5, lng: -0.12 }]);
  });

  test('returns an empty array for malformed payloads', () => {
    expect(parseNominatimResults(null)).toEqual([]);
    expect(parseNominatimResults('nope')).toEqual([]);
  });
});

describe('distanceMeters', () => {
  test('is ~0 for the same point', () => {
    expect(distanceMeters({ lat: 40, lng: -105 }, { lat: 40, lng: -105 })).toBeCloseTo(0, 5);
  });

  test('matches ~111 km per degree of latitude', () => {
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    expect(d).toBeGreaterThan(110_000);
    expect(d).toBeLessThan(112_000);
  });

  test('is symmetric', () => {
    const a = { lat: 51.5074, lng: -0.1278 };
    const b = { lat: 48.8566, lng: 2.3522 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 3);
  });

  test('accepts the (0,0) equator point (not treated as null island here)', () => {
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 })).toBeCloseTo(0, 5);
  });

  test('returns NaN for an out-of-range point', () => {
    expect(distanceMeters({ lat: 91, lng: 0 }, { lat: 40, lng: -105 })).toBeNaN();
  });
});

describe('coarsenCoordinate', () => {
  test('rounds to ~110 m (3 dp) by default', () => {
    expect(coarsenCoordinate(39.739215)).toBe(39.739);
    expect(coarsenCoordinate(-104.990251)).toBe(-104.99);
  });

  test('honours a custom precision', () => {
    expect(coarsenCoordinate(39.739215, 1)).toBe(39.7);
  });

  test('stays within ~160 m of the original point', () => {
    const original = { lat: 39.739215, lng: -104.990251 };
    const coarse = {
      lat: coarsenCoordinate(original.lat),
      lng: coarsenCoordinate(original.lng),
    };
    expect(distanceMeters(original, coarse)).toBeLessThan(160);
  });
});

describe('formatDistance', () => {
  test('renders metres under a kilometre, rounded to 10 m', () => {
    expect(formatDistance(0)).toBe('0 m');
    expect(formatDistance(124)).toBe('120 m');
  });
  test('renders kilometres above a kilometre', () => {
    expect(formatDistance(1300)).toBe('1.3 km');
    expect(formatDistance(12_400)).toBe('12 km');
  });
  test('is empty for NaN / negative', () => {
    expect(formatDistance(Number.NaN)).toBe('');
    expect(formatDistance(-5)).toBe('');
  });
});

describe('isApproximateFix', () => {
  test('treats iOS approximate and cell-tower fixes as approximate', () => {
    expect(isApproximateFix(3000)).toBe(true);
    expect(isApproximateFix(1200)).toBe(true);
  });

  test('keeps GPS, indoor Wi-Fi and unreported accuracy as usable', () => {
    expect(isApproximateFix(8)).toBe(false);
    expect(isApproximateFix(65)).toBe(false);
    expect(isApproximateFix(APPROXIMATE_FIX_M)).toBe(false);
    expect(isApproximateFix(null)).toBe(false);
    expect(isApproximateFix(Number.NaN)).toBe(false);
  });

  test('is loose enough for the check-in radius it protects', () => {
    // A usable fix must not be so rough it could not tell 200 m from 2 km.
    expect(APPROXIMATE_FIX_M).toBeLessThan(MOMENT_MATCH_RADIUS_M * 2);
  });
});
