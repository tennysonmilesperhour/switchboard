import 'server-only';

import {
  geocoderEndpoint,
  nominatimSearchUrl,
  nominatimUrl,
  parseNominatimResult,
  parseNominatimResults,
  PLACE_SEARCH_LIMIT,
  type MapPoint,
  type PlaceResult,
} from '@/lib/geo';
import { checkRateLimit } from '@/lib/server/rate-limit';

// Server-only: the browser CSP (`connect-src 'self' …supabase`) forbids this
// cross-origin call. The endpoint is configurable (`GEOCODER_URL`, any
// Nominatim-compatible `/search`) so a deployment can move off the public
// OpenStreetMap service without a code change; see `geocoderEndpoint`.
const HEADERS = {
  'User-Agent': 'SwitchboardBot/1.0 (+https://switchboard.app)',
  Accept: 'application/json',
} as const;

/**
 * One request per second, for the whole app, however many serverless instances
 * are answering. Nominatim's usage policy is an absolute ~1 req/s per
 * application; a per-process pause (all this used to have) is per instance, so
 * ten people pressing "Locate my plans" at once were ten times over it and got
 * the app blocked. The slot is claimed in the shared Postgres limiter; a caller
 * that can't get one within a few seconds reports the lookup as busy rather than
 * queueing forever.
 */
const GLOBAL_KEY = 'geocoder:global';
const SLOT_WAIT_MS = 1_050;
const SLOT_ATTEMPTS = 5;
const TIMEOUT_MS = 8_000;

/** How one lookup went, separating "no such place" from "no answer". */
export type GeocodeOutcome =
  | { status: 'found'; point: MapPoint }
  | { status: 'none' }
  | { status: 'unavailable' };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function claimSlot(): Promise<boolean> {
  for (let attempt = 0; attempt < SLOT_ATTEMPTS; attempt += 1) {
    if (await checkRateLimit(GLOBAL_KEY, 1, 1)) return true;
    await sleep(SLOT_WAIT_MS);
  }
  return false;
}

/**
 * GET the geocoder with a bounded timeout. `null` means it did not answer
 * usefully — a network failure, a timeout, a non-2xx (including 429 when the
 * provider is throttling us), or a body that isn't JSON. That is an outage, not
 * an empty result, and callers must be able to tell the two apart.
 */
async function fetchGeocoder(url: string): Promise<unknown | null> {
  if (!(await claimSlot())) return null;
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: HEADERS,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function endpoint(): string {
  return geocoderEndpoint(process.env.GEOCODER_URL);
}

/**
 * Forward-geocode a free-text address or place, saying whether it matched
 * nothing or the service didn't answer.
 */
export async function geocodeDetailed(query: string): Promise<GeocodeOutcome> {
  const trimmed = query.trim();
  if (!trimmed) return { status: 'none' };
  const json = await fetchGeocoder(nominatimUrl(trimmed, endpoint()));
  if (json === null) return { status: 'unavailable' };
  const point = parseNominatimResult(json);
  return point ? { status: 'found', point } : { status: 'none' };
}

/**
 * Forward-geocode to a single coordinate, or null on any miss or failure — for
 * callers that treat "couldn't locate" and "no such place" the same way (a plan
 * saves either way and can be located later).
 */
export async function geocode(query: string): Promise<MapPoint | null> {
  const outcome = await geocodeDetailed(query);
  return outcome.status === 'found' ? outcome.point : null;
}

/**
 * Search for up to `limit` places matching free text, for the "type a place"
 * autocomplete. `null` means the service didn't answer; `[]` means it answered
 * with nothing. Very short queries are dropped here too, so an over-eager caller
 * can't spend the shared budget on single-letter lookups.
 */
export async function searchPlacesDetailed(
  query: string,
  limit = PLACE_SEARCH_LIMIT,
): Promise<PlaceResult[] | null> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];
  const json = await fetchGeocoder(nominatimSearchUrl(trimmed, limit, endpoint()));
  return json === null ? null : parseNominatimResults(json, limit);
}

/** {@link searchPlacesDetailed}, with an outage read as no results. */
export async function searchPlaces(
  query: string,
  limit = PLACE_SEARCH_LIMIT,
): Promise<PlaceResult[]> {
  return (await searchPlacesDetailed(query, limit)) ?? [];
}
