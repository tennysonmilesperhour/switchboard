'use server';

import { failure, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { geocodeDetailed, searchPlacesDetailed } from '@/lib/server/geocode';
import type { PlaceResult } from '@/lib/geo';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';

export interface LocateResult {
  ok: boolean;
  located?: number; // rows given a coordinate this run
  unmatched?: number; // rows tried this run whose address matched nothing
  remaining?: number; // rows still lacking one afterward
  /** The lookup service stopped answering part-way; the rest wait for a retry. */
  interrupted?: boolean;
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
  if (!auth.ok) return auth;
  const { user } = auth;

  const trimmed = query.trim();
  if (trimmed.length < 3) return { ok: true, results: [] };

  if (!(await checkRateLimit(`place-search:${user.id}`, 60, 60))) {
    return failure('SB-RATE-LIMIT', 'Too many searches. Try again in a moment.');
  }

  try {
    const results = await searchPlacesDetailed(trimmed);
    // No answer at all is an outage, not "nothing matched": say so with the
    // code instead of showing an empty list the reader will try to fix.
    if (results === null) {
      return reportAndFail(
        'SB-MAP-LOOKUP',
        'map.search',
        new Error('geocoder did not answer'),
        { queryLength: trimmed.length },
      );
    }
    return { ok: true, results };
  } catch (error) {
    return reportAndFail('SB-MAP-LOOKUP', 'map.search', error, { queryLength: trimmed.length });
  }
}

// Bound latency: geocode at most this many rows per click. The ~1 req/s pace is
// kept app-wide inside the geocoder (see `claimSlot` in
// src/lib/server/geocode.ts), not by a sleep here. The button can be pressed
// again to work through a longer backlog.
const MAX_PER_RUN = 6;

type Pending = {
  id: string;
  query: string;
  /** Upcoming plans are placed before past ones. */
  upcoming: boolean;
};

/**
 * Upcoming plans first, then everything else, each group in a fresh random
 * order. There is no column recording a failed lookup, so a fixed order would
 * spend every press on the same few addresses that never match and never reach
 * the rest of the backlog.
 */
function lookupOrder(pending: Pending[]): Pending[] {
  const shuffled = pending
    .map((item) => ({ item, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);
  return [...shuffled.filter((p) => p.upcoming), ...shuffled.filter((p) => !p.upcoming)];
}

/**
 * Geocode the caller's OWN un-located plans from the free-text address each
 * already stores, caching the coordinate back onto the row so the map can plot
 * it. Every query is scoped to the caller's id (RLS is the backstop), and we
 * only ever write our own rows' latitude/longitude.
 *
 * Shared places (moments) are left out on purpose. A moment's place is a bare
 * name — "Café Luna", "Gate B27" — and the first match for it anywhere in the
 * world is not where anyone is. Worse, since D11 a located moment matches
 * people within 200 m of that point, so a guessed pin would introduce someone
 * to strangers in another city. A moment is located only by the device at
 * check-in ("use my location").
 *
 * Zones are left out for the same reason: they have no address, only a name. A
 * zone gets a pin from the place picker on its form.
 *
 * A lookup the service did not answer is not an unmatched address. The run
 * stops at the first one and says the lookup is down (SB-MAP-LOOKUP), rather
 * than reporting "Couldn't find N addresses" and sending the host off to
 * rewrite addresses that were fine.
 */
export async function locateMyPlaces(): Promise<LocateResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`geocode:${user.id}`, 40, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'Too many location lookups. Try again shortly.');
  }

  const { data: events, error: loadError } = await supabase
    .from('events')
    .select('id, location_name, location_address, starts_at')
    .eq('host_id', user.id)
    .is('latitude', null)
    .neq('status', 'cancelled');
  if (loadError) {
    return reportAndFail('SB-PLAN-LOAD', 'plans.load', loadError, { from: 'map.locate' });
  }

  const now = Date.now();
  const pending: Pending[] = [];
  for (const event of events ?? []) {
    const query = [event.location_name, event.location_address].filter(Boolean).join(', ');
    const upcoming = Boolean(event.starts_at) && Date.parse(event.starts_at as string) >= now;
    if (query) pending.push({ id: event.id, query, upcoming });
  }

  const batch = lookupOrder(pending).slice(0, MAX_PER_RUN);
  let located = 0;
  let unmatched = 0;
  let interrupted = false;
  for (const item of batch) {
    const outcome = await geocodeDetailed(item.query);
    if (outcome.status === 'unavailable') {
      interrupted = true;
      break;
    }
    if (outcome.status === 'none') {
      unmatched += 1;
      continue;
    }
    const { error } = await supabase
      .from('events')
      .update({ latitude: outcome.point.lat, longitude: outcome.point.lng })
      .eq('id', item.id)
      .eq('host_id', user.id);
    if (!error) located += 1;
  }

  if (interrupted) {
    if (located === 0 && unmatched === 0) {
      return reportAndFail('SB-MAP-LOOKUP', 'map.locate', new Error('geocoder did not answer'), {
        batch: batch.length,
      });
    }
    await reportOperationalError(
      'map.locate',
      new Error('geocoder stopped answering mid-run'),
      { located, unmatched },
      'SB-MAP-LOOKUP',
    );
  }

  revalidatePath('/map');
  return {
    ok: true,
    located,
    unmatched,
    remaining: Math.max(0, pending.length - located),
    interrupted,
  };
}
