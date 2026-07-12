import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header against an
 * expected secret. Server-only (imports node:crypto). Returns false when either
 * side is missing so callers can fail closed on an unset secret.
 *
 * Constant-time so response latency can't be used as an oracle to recover the
 * secret byte-by-byte — the precedent for every shared-secret comparison.
 */
export function bearerMatches(
  header: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // length isn't secret
  return timingSafeEqual(a, b);
}
