/**
 * Explore's range and audience rules, in one place so the page, the cards and
 * the tests agree.
 *
 * Distance never comes from device GPS. Both sides use a home point that
 * `private.coarse_distance_m` snaps to a ~28 km grid, so the finest honest
 * answer is a band, not a number: the same cell as you, within 50 km, or
 * within 100 km. The database returns the band; the range only narrows it.
 */

export type DistanceBand = 'area' | 'nearby' | 'wider';

export const EXPLORE_RANGES = [
  { value: 'area', label: 'My area', hint: 'Around your home area', maxKm: 1 },
  { value: 'nearby', label: 'Nearby', hint: 'Within about 50 km', maxKm: 50 },
  { value: 'wider', label: 'Farther out', hint: 'Within about 100 km', maxKm: 100 },
  { value: 'any', label: 'Anywhere', hint: 'Includes people with no city set', maxKm: 100 },
] as const;

export type ExploreRange = (typeof EXPLORE_RANGES)[number]['value'];

export const DEFAULT_RANGE: ExploreRange = 'nearby';

const BAND_RANK: Record<DistanceBand, number> = { area: 0, nearby: 1, wider: 2 };
const RANGE_RANK: Record<ExploreRange, number> = { area: 0, nearby: 1, wider: 2, any: 3 };

export function isExploreRange(value: unknown): value is ExploreRange {
  return EXPLORE_RANGES.some((range) => range.value === value);
}

export function isDistanceBand(value: unknown): value is DistanceBand {
  return value === 'area' || value === 'nearby' || value === 'wider';
}

/**
 * Whether something in `band` falls inside the chosen range. No band means
 * the database could not place it (one side has no city set or has geography
 * off), which only "Anywhere" admits: guessing it is close would be a lie.
 */
export function bandWithinRange(band: DistanceBand | null, range: ExploreRange): boolean {
  if (band === null) return range === 'any';
  return BAND_RANK[band] <= RANGE_RANK[range];
}

export const BAND_LABEL: Record<DistanceBand, string> = {
  area: 'In your area',
  nearby: 'Nearby',
  wider: 'A bit farther',
};

/** Who a plan is from, relative to the reader. */
export type Audience = 'all' | 'connections' | 'strangers';

export const AUDIENCES: ReadonlyArray<{ value: Audience; label: string }> = [
  { value: 'all', label: 'Everyone' },
  { value: 'connections', label: 'My circle' },
  { value: 'strangers', label: 'New people' },
];

export function matchesAudience(knownVia: string | null, audience: Audience): boolean {
  if (audience === 'all') return true;
  return audience === 'connections' ? Boolean(knownVia) : !knownVia;
}

export const BROADCAST_NEEDS_HOME_AREA =
  'To show this plan to people nearby, add your city under Edit profile first. That is what we measure range from.';
