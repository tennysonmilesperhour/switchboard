import { describe, it, expect } from 'vitest';
import { mapsSearchUrl } from './maps';

function query(url: string | null): string | null {
  if (!url) return null;
  return new URL(url).searchParams.get('query');
}

describe('mapsSearchUrl', () => {
  it('searches for name and address together', () => {
    expect(query(mapsSearchUrl('Café Luna', '12 Main St, Milwaukee'))).toBe(
      'Café Luna, 12 Main St, Milwaukee',
    );
  });

  it('works with only one of the two', () => {
    expect(query(mapsSearchUrl('Miller Park', null))).toBe('Miller Park');
    expect(query(mapsSearchUrl(null, '12 Main St'))).toBe('12 Main St');
  });

  it('does not repeat an identical name and address', () => {
    expect(query(mapsSearchUrl('Miller Park', 'Miller Park'))).toBe('Miller Park');
  });

  it('returns null when there is nothing to search for', () => {
    expect(mapsSearchUrl(null, null)).toBeNull();
    expect(mapsSearchUrl('  ', '')).toBeNull();
  });

  it('encodes the query so free-typed locations survive', () => {
    const url = mapsSearchUrl('Ann & Bob’s place', '1 A St #4');
    expect(url).not.toContain(' ');
    expect(url).not.toContain('&1');
    expect(query(url)).toBe('Ann & Bob’s place, 1 A St #4');
  });
});
