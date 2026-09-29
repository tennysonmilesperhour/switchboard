import 'server-only';

import { isOwnPublicStorageUrl } from '@/lib/server/media';
import { safeHttpUrl } from '@/lib/security';

const MAX_COVER_BYTES = 4 * 1024 * 1024;
const COVER_TIMEOUT_MS = 4000;

export type CoverImageType = 'image/png' | 'image/jpeg';

/** What the bytes are, from their signature — never from a header. */
export function coverImageType(bytes: Uint8Array): CoverImageType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  return null;
}

/** The cover URL this route may fetch, or null. Pure, so the gate is tested on its own. */
export function fetchableCover(coverUrl: string | null | undefined): string | null {
  const url = safeHttpUrl(coverUrl);
  return url && isOwnPublicStorageUrl(url, ['media']) ? url : null;
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_COVER_BYTES) return null;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * The plan's cover image for its link preview (G23), as a data URI the OG
 * renderer can draw without fetching anything itself.
 *
 * Only a cover uploaded to our own public `media` bucket is used. The preview
 * route answers anyone holding an event id, with no session, so it must not be
 * a way to make this server fetch an address a host typed (a pasted cover link
 * could name an internal service). A pasted link falls back to the text card.
 *
 * Returns null — never throws — for anything it cannot use: not ours, not
 * reachable in time, too large, or not a PNG or JPEG (the formats the renderer
 * draws reliably). The preview then renders as it always did.
 */
export async function ogCoverDataUri(
  coverUrl: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = fetchableCover(coverUrl);
  if (!url) return null;
  try {
    const response = await fetchImpl(url, {
      // A redirect would leave our storage origin; the gate above no longer holds.
      redirect: 'error',
      signal: AbortSignal.timeout(COVER_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > MAX_COVER_BYTES) return null;
    const bytes = await readCapped(response);
    if (!bytes) return null;
    const type = coverImageType(bytes);
    if (!type) return null;
    return `data:${type};base64,${Buffer.from(bytes).toString('base64')}`;
  } catch {
    return null;
  }
}
