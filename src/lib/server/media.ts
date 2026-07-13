import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';

/** The private bucket that holds access-gated media (voice notes, capsule photos). */
export const PRIVATE_MEDIA_BUCKET = 'media-private';

// How long a signed URL stays valid. Pages that render gated media are
// dynamically rendered and re-sign on every request, so a short window is fine.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * A stored media reference is a bare storage PATH in the private bucket
 * (`<uid>/voice-….webm`) for anything uploaded after the F4 migration. Legacy
 * rows (and pasted external links) hold a full `http(s)://` URL. This
 * classifier lets the signer pass legacy/external URLs through untouched while
 * signing private paths — pure and unit-tested.
 */
export function isStoredMediaPath(ref: string): boolean {
  if (!ref) return false;
  if (/^https?:\/\//i.test(ref)) return false; // full URL (legacy public / external)
  // A private object path: `<uid>/<filename>`, no scheme, no traversal.
  return !ref.includes('..') && /^[^/]+\/[^/].*$/.test(ref);
}

/**
 * Validate a media reference before it is stored: either a private-bucket path
 * (a new upload) or an `https://` URL (a legacy public object). Rejects
 * `http://`, javascript:/data: schemes, and path-traversal.
 */
export function isValidMediaRef(ref: string): boolean {
  return /^https:\/\//i.test(ref) || isStoredMediaPath(ref);
}

/**
 * True if `url` is a public URL into one of our own Supabase Storage buckets,
 * e.g. `…/storage/v1/object/public/avatars/…`. The single gate for "this image
 * lives in our storage, not an attacker-chosen origin" — used by the profile
 * and capsule validators instead of each re-deriving the path shape.
 */
export function isOwnPublicStorageUrl(url: string, buckets: string[]): boolean {
  const alt = buckets.join('|');
  return new RegExp(`/storage/v1/object/public/(?:${alt})/`).test(url);
}

/**
 * Resolve a stored media reference to a URL the browser can load. Private-bucket
 * paths become short-lived signed URLs (minted with the service-role client, so
 * the caller must already have passed the app's row-level authorization to see
 * the reference at all). Full URLs — legacy public objects or pasted links —
 * are returned unchanged. Returns null when there is nothing to show or signing
 * fails, so callers render "no media" rather than a broken tag.
 */
export async function signMediaRef(
  ref: string | null | undefined,
): Promise<string | null> {
  if (!ref) return null;
  if (!isStoredMediaPath(ref)) return ref; // already a URL
  if (!hasAdminCredentials()) return null;

  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(PRIVATE_MEDIA_BUCKET)
    .createSignedUrl(ref, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
