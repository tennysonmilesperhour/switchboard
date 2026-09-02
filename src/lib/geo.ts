/**
 * Pure geo helpers for the map overlays. Dependency-free so the client map and
 * the server-side geocoder can share (and unit-test) the same coordinate rules.
 */

/** The overlay layers the map can toggle. `you` is the caller's own live pin
 *  and `live` is other people currently sharing their location nearby. */
export type MapLayerKey = 'plans' | 'zones' | 'places' | 'live' | 'you';

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

const EARTH_RADIUS_M = 6_371_000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** In-range, finite lat/lng — unlike isValidCoordinate this does NOT reject the
 *  (0,0) point, which is a real place for distance maths (just a suspicious
 *  geocode result). */
function inRange(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Great-circle distance in metres between two points (haversine). Mirrors the
 * SQL used by `find_nearby_people` so the client can label "how far" without a
 * round trip. Returns NaN if either point is out of range or non-finite.
 */
export function distanceMeters(a: MapPoint, b: MapPoint): number {
  if (!inRange(a?.lat, a?.lng) || !inRange(b?.lat, b?.lng)) {
    return Number.NaN;
  }
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Round a coordinate to `decimals` places (default 3 ≈ 110 m). Live-location
 * actions apply this before persistence, and the database write trigger repeats
 * the rule so direct clients cannot bypass it.
 */
export function coarsenCoordinate(value: number, decimals = 3): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Human-friendly distance: "120 m", "1.3 km", "12 km". Empty for NaN. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
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

/** How many autocomplete candidates we ever ask Nominatim for. */
export const PLACE_SEARCH_LIMIT = 5;

/**
 * A single map-recognized place the host can pick from search: a short label
 * (the venue/place name), the full formatted address, and a validated point.
 */
export interface PlaceResult {
  /** Short, human-facing name — the venue or first address component. */
  label: string;
  /** Full formatted address, for disambiguating similarly-named places. */
  address: string;
  lat: number;
  lng: number;
}

/** Build a Nominatim URL that returns up to `limit` candidate places. */
export function nominatimSearchUrl(query: string, limit = PLACE_SEARCH_LIMIT): string {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    // Clamp so a caller can't ask Nominatim for an unbounded page.
    limit: String(Math.min(Math.max(Math.trunc(limit) || 1, 1), 10)),
  });
  return `${NOMINATIM_ENDPOINT}?${params.toString()}`;
}

/**
 * Parse a Nominatim search payload into up to `limit` plottable places, keeping
 * only entries with a usable coordinate. `name` is Nominatim's short label for a
 * named POI; when it's absent (e.g. a plain address) we fall back to the first
 * component of `display_name`.
 */
export function parseNominatimResults(json: unknown, limit = PLACE_SEARCH_LIMIT): PlaceResult[] {
  if (!Array.isArray(json)) return [];
  const results: PlaceResult[] = [];
  for (const raw of json) {
    const item = raw as {
      lat?: unknown;
      lon?: unknown;
      name?: unknown;
      display_name?: unknown;
    };
    const point = toMapPoint(Number(item.lat), Number(item.lon));
    if (!point) continue;
    const display = typeof item.display_name === 'string' ? item.display_name.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const label = name || display.split(',')[0]?.trim() || display;
    if (!label) continue;
    results.push({ label, address: display || label, lat: point.lat, lng: point.lng });
    if (results.length >= limit) break;
  }
  return results;
}
