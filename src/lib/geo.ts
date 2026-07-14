/**
 * Pure geo helpers for the map overlays. Dependency-free so the client map and
 * the server-side geocoder can share (and unit-test) the same coordinate rules.
 */

/** The overlay layers the map can toggle. */
export type MapLayerKey = 'plans' | 'zones' | 'places';

export interface MapPoint {
  lat: number;
  lng: number;
}

/** A plottable item: a validated point plus how to label and link it. */
export interface MapMarker {
  id: string;
  layer: MapLayerKey;
  label: string;
  sub?: string;
  lat: number;
  lng: number;
  href?: string;
}

/**
 * A usable WGS84 coordinate: finite, lat in [-90, 90], lng in [-180, 180]. We
 * also reject the exact "null island" (0, 0), which is almost always a failed
 * geocode rather than a real venue in the Gulf of Guinea.
 */
export function isValidCoordinate(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** Narrow a row's nullable latitude/longitude to a MapPoint, or null. */
export function toMapPoint(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): MapPoint | null {
  return isValidCoordinate(latitude, longitude)
    ? { lat: latitude as number, lng: longitude as number }
    : null;
}

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

/** Build a Nominatim forward-geocode URL for a free-text address or place. */
export function nominatimUrl(query: string): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
  });
  return `${NOMINATIM_ENDPOINT}?${params.toString()}`;
}

/** Parse the first Nominatim result into a MapPoint, or null if none/invalid. */
export function parseNominatimResult(json: unknown): MapPoint | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const first = json[0] as { lat?: unknown; lon?: unknown };
  return toMapPoint(Number(first.lat), Number(first.lon));
}
