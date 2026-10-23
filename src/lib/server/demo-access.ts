import 'server-only';

import { proposalAccessGranted } from '@/lib/server/proposal-access';

/**
 * Whether the token in `/demo/<token>` is the configured one.
 *
 * The same rule as the proposal link (constant-time, fail-closed, at least
 * `MIN_PROPOSAL_TOKEN_LENGTH` characters), against its own secret so either
 * link can be rotated without breaking the other.
 */
export function demoAccessGranted(
  token: string | null | undefined,
  secret: string | undefined = process.env.DEMO_ACCESS_TOKEN,
): boolean {
  return proposalAccessGranted(token, secret);
}
