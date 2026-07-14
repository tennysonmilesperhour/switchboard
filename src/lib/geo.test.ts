import { describe, expect, test } from 'vitest';
import {
  isValidCoordinate,
  nominatimUrl,
  parseNominatimResult,
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
