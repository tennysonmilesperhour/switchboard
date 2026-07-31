'use server';

import type { ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { geocode, searchPlaces as nominatimSearch } from '@/lib/server/geocode';
import type { PlaceResult } from '@/lib/geo';

export interface LocateResult {
  ok: boolean;
  located?: number; // rows given a coordinate this run
  remaining?: number; // rows still lacking one afterward
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
}

export interface PlaceSearchResult {
  ok: boolean;
  results?: PlaceResult[];
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
}

/**
 * Autocomplete for the "Where?" field: return a few map-recognized places for
 * what the host has typed so far, each carrying the coordinate we'll store so
 * the plan lands on the map. Signed-in + rate-limited, since it fires as the
 * host types (the client debounces and only queries 3+ characters). An empty
 * result list — no matches, or the query was too short — is a normal `ok`.
 */
export async function searchPlaces(query: string): Promise<PlaceSearchResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { user } = auth;

  const trimmed = query.trim();
  if (trimmed.length < 3) return { ok: true, results: [] };

  if (!(await checkRateLimit(`place-search:${user.id}`, 60, 60))) {
    return { ok: false, error: 'Too many searches. Try again in a moment.' };
  }

  return { ok: true, results: await nominatimSearch(trimmed) };
}

// Bound latency and respect Nominatim's ~1 req/sec policy: geocode at most this
// many rows per click, spacing the calls out. The button can be pressed again
// to work through a longer backlog.
const MAX_PER_RUN = 6;
const SPACING_MS = 1100;

type Pending = { table: 'events' | 'zones' | 'moments'; id: string; query: string };

/**
 * Geocode the caller's OWN un-located entities — plans they host, zones they
 * organize, shared places they opened — from the free-text address the row
 * already stores, caching the coordinate back onto the row so the map can plot
 * it. Every query is scoped to the caller's id (RLS is the backstop), and we
 * only ever write our own rows' latitude/longitude.
 */
export async function locateMyPlaces(): Promise<LocateResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`geocode:${user.id}`, 40, 60 * 60))) {
    return { ok: false, error: 'Too many location lookups. Try again shortly.' };
  }

  const [{ data: events }, { data: zones }, { data: moments }] = await Promise.all([
    supabase
      .from('events')
      .select('id, location_name, location_address')
      .eq('host_id', user.id)
      .is('latitude', null)
      .neq('status', 'cancelled'),
    supabase
      .from('zones')
      .select('id, name')
      .eq('organizer_id', user.id)
      .is('latitude', null),
    supabase
      .from('moments')
      .select('id, place_name')
      .eq('user_id', user.id)
      .is('latitude', null),
  ]);

  const pending: Pending[] = [];
  for (const event of events ?? []) {
    const query = [event.location_name, event.location_address].filter(Boolean).join(', ');
    if (query) pending.push({ table: 'events', id: event.id, query });
  }
  for (const zone of zones ?? []) {
    // Zones carry no address column, so their name is the best available hint;
    // an unrecognizable name simply geocodes to null and stays unplaced.
    if (zone.name) pending.push({ table: 'zones', id: zone.id, query: zone.name });
  }
  for (const moment of moments ?? []) {
    if (moment.place_name) pending.push({ table: 'moments', id: moment.id, query: moment.place_name });
  }

  let located = 0;
  for (const item of pending.slice(0, MAX_PER_RUN)) {
    const point = await geocode(item.query);
    if (point) {
      const { error } = await supabase
        .from(item.table)
        .update({ latitude: point.lat, longitude: point.lng })
        .eq('id', item.id);
      if (!error) located += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, SPACING_MS));
  }

  revalidatePath('/map');
  return { ok: true, located, remaining: Math.max(0, pending.length - located) };
}
