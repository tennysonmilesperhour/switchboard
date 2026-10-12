import 'server-only';

import { bearerMatches } from '@/lib/server/secret';

/**
 * A secret shorter than this is treated as not configured. The link is the only
 * thing between the open internet and the proposal's fees and investor strategy,
 * so a value someone could guess is refused the same way an unset one is.
 */
export const MIN_PROPOSAL_TOKEN_LENGTH = 24;

/**
 * Whether the token in `/proposal/<token>` is the configured one.
 *
 * Fail-closed: with `PROPOSAL_ACCESS_TOKEN` unset or too short nobody gets in,
 * including a request that sends an empty token. The comparison is constant-time
 * (docs/SECURITY.md §8) by reusing `bearerMatches` rather than `===`.
 */
export function proposalAccessGranted(
  token: string | null | undefined,
  secret: string | undefined = process.env.PROPOSAL_ACCESS_TOKEN,
): boolean {
  if (!token || !secret || secret.length < MIN_PROPOSAL_TOKEN_LENGTH) return false;
  return bearerMatches(`Bearer ${token}`, secret);
}
