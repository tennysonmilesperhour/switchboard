import { describe, expect, it } from 'vitest';
import {
  AUDIENCES,
  EXPLORE_RANGES,
  bandWithinRange,
  isDistanceBand,
  isExploreRange,
  matchesAudience,
} from './nearby-plans';

describe('bandWithinRange', () => {
  it('widens with the range', () => {
    expect(bandWithinRange('area', 'area')).toBe(true);
    expect(bandWithinRange('nearby', 'area')).toBe(false);
    expect(bandWithinRange('nearby', 'nearby')).toBe(true);
    expect(bandWithinRange('wider', 'nearby')).toBe(false);
    expect(bandWithinRange('wider', 'wider')).toBe(true);
  });

  it('admits something it could not place only under Anywhere', () => {
    for (const range of EXPLORE_RANGES) {
      expect(bandWithinRange(null, range.value)).toBe(range.value === 'any');
    }
  });

  it('puts everything placeable inside Anywhere', () => {
    for (const band of ['area', 'nearby', 'wider'] as const) {
      expect(bandWithinRange(band, 'any')).toBe(true);
    }
  });
});

describe('guards', () => {
  it('only accepts the bands the database returns', () => {
    expect(isDistanceBand('nearby')).toBe(true);
    expect(isDistanceBand('far')).toBe(false);
    expect(isDistanceBand(null)).toBe(false);
  });

  it('only accepts known ranges', () => {
    expect(isExploreRange('any')).toBe(true);
    expect(isExploreRange('galaxy')).toBe(false);
  });
});

describe('matchesAudience', () => {
  it('splits circle from new people, and everyone is both', () => {
    expect(matchesAudience('Ana', 'connections')).toBe(true);
    expect(matchesAudience(null, 'connections')).toBe(false);
    expect(matchesAudience('Ana', 'strangers')).toBe(false);
    expect(matchesAudience(null, 'strangers')).toBe(true);
    for (const known of ['Ana', null]) expect(matchesAudience(known, 'all')).toBe(true);
  });

  it('offers every audience it can filter by', () => {
    expect(AUDIENCES.map((a) => a.value)).toEqual(['all', 'connections', 'strangers']);
  });
});
