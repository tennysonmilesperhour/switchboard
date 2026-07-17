import {
  nominatimSearchUrl,
  nominatimUrl,
  parseNominatimResult,
  parseNominatimResults,
  PLACE_SEARCH_LIMIT,
  type MapPoint,
  type PlaceResult,
} from '@/lib/geo';

// Server-only: the browser CSP (`connect-src 'self' …supabase`) forbids this
// cross-origin call, and Nominatim's usage policy requires an identifying
// User-Agent and no more than ~1 request/second — callers are responsible for
// spacing/rate-limiting their calls.
const NOMINATIM_HEADERS = {
  'User-Agent': 'SwitchboardBot/1.0 (+https://switchboard.app)',
  Accept: 'application/json',
} as const;

/** GET a Nominatim endpoint with a bounded timeout, or null on any failure. */
async function fetchNominatim(url: string): Promise<unknown | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(url, { signal: controller.signal, headers: NOMINATIM_HEADERS });
    clearTimeout(timer);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Forward-geocode a free-text address/place to a single coordinate. Returns null
 * on any miss/failure so callers can treat "couldn't locate" and "no such place"
 * the same way.
 */
export async function geocode(query: string): Promise<MapPoint | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const json = await fetchNominatim(nominatimUrl(trimmed));
  return json === null ? null : parseNominatimResult(json);
}

/**
 * Search for up to `limit` map-recognized places matching free text, for the
 * "type a place" autocomplete. Returns an empty list on any miss/failure. Very
 * short queries are dropped here too, so an over-eager caller can't spam
 * Nominatim with single-letter lookups.
 */
export async function searchPlaces(
  query: string,
  limit = PLACE_SEARCH_LIMIT,
): Promise<PlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const json = await fetchNominatim(nominatimSearchUrl(trimmed, limit));
  return json === null ? [] : parseNominatimResults(json, limit);
}
