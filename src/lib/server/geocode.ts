import { nominatimUrl, parseNominatimResult, type MapPoint } from '@/lib/geo';

/**
 * Forward-geocode a free-text address/place to a coordinate via OpenStreetMap's
 * Nominatim. Server-only: the browser CSP (`connect-src 'self' …supabase`)
 * forbids this cross-origin call, and Nominatim's usage policy requires an
 * identifying User-Agent and no more than ~1 request/second — batched callers
 * are responsible for spacing their calls. Returns null on any miss/failure so
 * callers can treat "couldn't locate" and "no such place" the same way.
 */
export async function geocode(query: string): Promise<MapPoint | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(nominatimUrl(trimmed), {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SwitchboardBot/1.0 (+https://switchboard.app)',
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);
    if (!response.ok) return null;
    return parseNominatimResult(await response.json());
  } catch {
    return null;
  }
}
