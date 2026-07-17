'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { isValidCoordinate } from '@/lib/geo';
import type { LiveLocation, LocationVisibility, NearbyPerson } from '@/lib/types';

export interface ShareResult {
  ok: boolean;
  error?: string;
  expiresAt?: string;
}

export interface NearbyResult {
  ok: boolean;
  error?: string;
  people?: NearbyPerson[];
}

// Sharing is always time-boxed. The window is the user's choice, clamped so a
// live location can never linger indefinitely.
const MIN_HOURS = 1;
const MAX_HOURS = 8;
const DEFAULT_HOURS = 2;

// Discovery radius bounds (metres): a live map is for "around here", not a
// nation-wide people search. Clamped before it reaches the RPC.
const MIN_RADIUS_M = 100;
const MAX_RADIUS_M = 50_000;
const DEFAULT_RADIUS_M = 5_000;

function sanitizeVisibility(value: unknown): LocationVisibility {
  return value === 'connections' ? 'connections' : 'sharers';
}

function clampHours(hours: number | undefined): number {
  if (!Number.isFinite(hours as number)) return DEFAULT_HOURS;
  return Math.min(MAX_HOURS, Math.max(MIN_HOURS, Math.round(hours as number)));
}

export interface ShareLocationInput {
  lat: number;
  lng: number;
  accuracyM?: number | null;
  headline?: string | null;
  emoji?: string | null;
  visibility?: LocationVisibility;
  hours?: number;
}

/**
 * Turn live location on (or update the details of an active share). Upserts the
 * caller's single owner-only row with a fresh expiry. The exact coordinate is
 * stored for the caller's own pin and for distance maths; what OTHER people see
 * is coarsened inside `find_nearby_people`. Opt-in and time-boxed by design.
 */
export async function shareLocation(input: ShareLocationInput): Promise<ShareResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  if (!isValidCoordinate(input.lat, input.lng)) {
    return { ok: false, error: 'Could not read a valid location from your device.' };
  }
  // Position updates fire as the user moves; keep the ceiling generous but real.
  if (!(await checkRateLimit(`live-share:${user.id}`, 300, 60 * 60))) {
    return { ok: false, error: 'Too many location updates. Try again in a moment.' };
  }

  const expiresAt = new Date(Date.now() + clampHours(input.hours) * 3_600_000).toISOString();
  const headline = input.headline?.trim().slice(0, 90) || null;
  const emoji = input.emoji?.trim().slice(0, 8) || null;
  const accuracy =
    typeof input.accuracyM === 'number' && Number.isFinite(input.accuracyM) && input.accuracyM >= 0
      ? input.accuracyM
      : null;

  const { error } = await supabase.from('live_locations').upsert(
    {
      user_id: user.id,
      latitude: input.lat,
      longitude: input.lng,
      accuracy_m: accuracy,
      headline,
      emoji,
      visibility: sanitizeVisibility(input.visibility),
      updated_at: new Date().toISOString(),
      expires_at: expiresAt,
    },
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath('/map');
  return { ok: true, expiresAt };
}

/**
 * Update just the caller's live coordinate as they move. Unlike shareLocation
 * this never (re)starts a share or extends the window: it only touches a row
 * that is already live, so stopping or letting a share expire is final.
 */
export async function refreshLocationPoint(
  lat: number,
  lng: number,
  accuracyM?: number | null,
): Promise<ShareResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  if (!isValidCoordinate(lat, lng)) {
    return { ok: false, error: 'Invalid location.' };
  }
  if (!(await checkRateLimit(`live-share:${user.id}`, 300, 60 * 60))) {
    return { ok: false, error: 'Too many location updates.' };
  }

  const accuracy =
    typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM >= 0 ? accuracyM : null;

  const { data, error } = await supabase
    .from('live_locations')
    .update({ latitude: lat, longitude: lng, accuracy_m: accuracy, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .select('user_id')
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'not_sharing' };
  return { ok: true };
}

/** Turn live location off — deletes the caller's row so nobody can discover it. */
export async function stopSharingLocation(): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  const { error } = await supabase.from('live_locations').delete().eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/map');
  return { ok: true };
}

/** The caller's own active share, or null if they aren't sharing (or it lapsed). */
export async function getMySharing(): Promise<LiveLocation | null> {
  const auth = await requireUser();
  if (!auth.ok) return null;
  const { supabase, user } = auth;

  const { data } = await supabase
    .from('live_locations')
    .select('user_id, latitude, longitude, accuracy_m, headline, emoji, visibility, updated_at, expires_at')
    .eq('user_id', user.id)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  return (data as LiveLocation | null) ?? null;
}

/**
 * People currently sharing near the caller. Returns [] (never an error) when the
 * caller isn't sharing — the RPC enforces the mutual "see and be seen" rule, so
 * an empty result and "you're not sharing" are the same to the UI.
 */
export async function getNearbyPeople(radiusM = DEFAULT_RADIUS_M): Promise<NearbyResult> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`live-nearby:${user.id}`, 300, 60 * 60))) {
    return { ok: false, error: 'Too many refreshes. Try again in a moment.' };
  }

  const radius = Math.min(
    MAX_RADIUS_M,
    Math.max(MIN_RADIUS_M, Number.isFinite(radiusM) ? radiusM : DEFAULT_RADIUS_M),
  );

  const { data, error } = await supabase.rpc('find_nearby_people', { p_radius_m: radius });
  if (error) return { ok: false, error: error.message };
  return { ok: true, people: (data as NearbyPerson[]) ?? [] };
}
