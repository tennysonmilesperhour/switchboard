'use server';

import { validation, type ActionResult, type ErrorCode } from '@/lib/errors';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { reportAndFail } from '@/lib/server/observability';
import { isValidCoordinate } from '@/lib/geo';
import { sendMessage } from '@/lib/actions/rooms';
import { EXACT_NOT_ALLOWED, EXACT_STARTED_MESSAGE } from '@/lib/exact-location';

/**
 * Exact location between two people who matched, so they can find each other
 * in person (20261008120000_exact_location_in_match_rooms.sql).
 *
 * The database decides who may share and who may see: two-person rooms only,
 * both still members, no block, see-and-be-seen, 60 minutes, hidden after 15
 * silent minutes. These actions only carry the request and say why it was
 * refused.
 */

export interface ExactPoint {
  userId: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  updatedAt: string;
  expiresAt: string;
  isMe: boolean;
}

export interface ExactLocationsResult {
  ok: boolean;
  error?: string;
  code?: ErrorCode;
  fix?: string | null;
  points?: ExactPoint[];
}

// A walking person moves a few metres a second; one write every ~4 s at most
// is plenty to follow them, with room for the heartbeat.
const WRITE_LIMIT = 900;
const READ_LIMIT = 1200;
const WINDOW_SECONDS = 60 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cleanAccuracy(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

/**
 * Start sharing (`restart`), or move an active share to a new point. A move
 * never restarts a share that was stopped or ran out.
 */
export async function shareExactLocation(
  roomId: string,
  lat: number,
  lng: number,
  accuracyM: number | null,
  restart: boolean,
): Promise<ActionResult & { status?: 'shared' | 'not_sharing' }> {
  if (!UUID_RE.test(roomId)) return validation(EXACT_NOT_ALLOWED);
  if (!isValidCoordinate(lat, lng)) return validation('Your device sent a location that isn’t valid. Try again.');

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`exact-share:${user.id}:${roomId}`, WRITE_LIMIT, WINDOW_SECONDS))) {
    return validation('Too many location updates. Wait a moment and it will pick up again.');
  }

  const { data: status, error } = await supabase.rpc('share_exact_location', {
    p_room: roomId,
    p_latitude: lat,
    p_longitude: lng,
    p_accuracy_m: cleanAccuracy(accuracyM) ?? undefined,
    p_restart: restart,
  });
  if (error) return reportAndFail('SB-LOCATION-SAVE', 'exact.share', error, { roomId });
  if (status === 'not_allowed') return validation(EXACT_NOT_ALLOWED);
  if (status === 'invalid') return validation('Your device sent a location that isn’t valid. Try again.');
  if (status === 'not_sharing') return { ok: true, status: 'not_sharing' };

  if (restart) {
    // Tell the other person in the chat, which also notifies them. Best effort:
    // the share itself already worked.
    await sendMessage(roomId, EXACT_STARTED_MESSAGE).catch(() => undefined);
  }
  return { ok: true, status: 'shared' };
}

export async function stopExactLocation(roomId: string): Promise<ActionResult> {
  if (!UUID_RE.test(roomId)) return validation(EXACT_NOT_ALLOWED);
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { error } = await supabase.rpc('stop_exact_location', { p_room: roomId });
  if (error) return reportAndFail('SB-LOCATION-SAVE', 'exact.stop', error, { roomId });
  return { ok: true };
}

/** The caller's own share and, while theirs is live, the other person's. */
export async function getExactLocations(roomId: string): Promise<ExactLocationsResult> {
  if (!UUID_RE.test(roomId)) return { ok: true, points: [] };
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await checkRateLimit(`exact-read:${user.id}:${roomId}`, READ_LIMIT, WINDOW_SECONDS))) {
    return validation('Too many refreshes. Wait a moment and it will pick up again.');
  }

  const { data, error } = await supabase.rpc('exact_locations_in_room', { p_room: roomId });
  if (error) return reportAndFail('SB-LOCATION-LOAD', 'exact.load', error, { roomId });

  return {
    ok: true,
    points: (data ?? []).map((row) => ({
      userId: row.user_id,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracy_m,
      updatedAt: row.updated_at,
      expiresAt: row.expires_at,
      isMe: row.is_me,
    })),
  };
}
