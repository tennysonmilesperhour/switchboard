import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { isStoredMediaPath, PRIVATE_MEDIA_BUCKET } from '@/lib/server/media';

/** Matches the render sites that already sign gated media (see media.ts). */
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * True when a stored room-photo reference is a private-bucket path inside the
 * given person's own upload folder (`<uid>/room-….jpg`).
 *
 * The database enforces the same rule on write
 * (20260930021000_private_room_photos.sql). It is repeated at the one place a
 * path turns into a URL because `media-private` also holds voice notes and
 * capsule photos: a signer that trusted any path handed to it would open all of
 * them to whoever could get a path into a room.
 */
export function isOwnRoomPhotoPath(ref: string, ownerId: string): boolean {
  return isStoredMediaPath(ref) && ref.split('/')[0] === ownerId;
}

/** One photo to resolve: a caller-chosen key, the stored ref, and who wrote it. */
export interface RoomPhotoRef {
  key: string;
  ref: string | null | undefined;
  ownerId: string | null | undefined;
}

/**
 * Turn stored room-photo references into URLs a browser can load.
 *
 * Callers must already have read the rows through the viewer's own RLS client —
 * that read is the authorization; this only signs what it returned (docs/
 * SECURITY.md, "Media privacy"). Private paths become one-hour signed URLs,
 * minted in one batch. A legacy public `https://` URL (a photo sent before
 * room photos went private) passes through unchanged, so old rooms keep
 * rendering. Anything else — a path outside its writer's folder, a failed
 * signature, an unconfigured deployment — resolves to null, and the room shows
 * no image rather than a broken one.
 */
export async function signRoomPhotos(
  refs: RoomPhotoRef[],
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  const pending: Array<{ key: string; path: string }> = [];

  for (const { key, ref, ownerId } of refs) {
    if (!ref) {
      resolved.set(key, null);
    } else if (/^https:\/\//i.test(ref)) {
      resolved.set(key, ref);
    } else if (ownerId && isOwnRoomPhotoPath(ref, ownerId)) {
      pending.push({ key, path: ref });
    } else {
      resolved.set(key, null);
    }
  }

  if (pending.length === 0) return resolved;
  if (!hasAdminCredentials()) {
    for (const { key } of pending) resolved.set(key, null);
    return resolved;
  }

  const paths = [...new Set(pending.map((item) => item.path))];
  const { data, error } = await createAdminClient()
    .storage.from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const byPath = new Map<string, string>();
  if (!error) {
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error) byPath.set(row.path, row.signedUrl);
    }
  }
  for (const { key, path } of pending) resolved.set(key, byPath.get(path) ?? null);
  return resolved;
}
