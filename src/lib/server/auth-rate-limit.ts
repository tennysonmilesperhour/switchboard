import { checkRateLimit } from '@/lib/server/rate-limit';
import { requestClientIp } from '@/lib/server/request-ip';

type AuthAttemptKind = 'signin' | 'signup';

const POLICIES: Record<
  AuthAttemptKind,
  { windowSeconds: number; ipLimit: number; identifierBackoffAt: number }
> = {
  // The IP bucket is the brute-force boundary. The identifier bucket is a
  // higher, soft threshold: crossing it slows the request but never lets a
  // stranger remotely lock a known account out.
  signin: {
    windowSeconds: 10 * 60,
    ipLimit: 30,
    identifierBackoffAt: 20,
  },
  signup: {
    windowSeconds: 60 * 60,
    ipLimit: 12,
    identifierBackoffAt: 10,
  },
};

const IDENTIFIER_BACKOFF_MS = 750;

export interface AuthAttemptDecision {
  allowed: boolean;
  backedOff: boolean;
}

/**
 * Enforce the non-spoofable deployment IP bucket, then use the identifier only
 * as a soft backoff signal. Both limiter reads fail closed if state is down.
 */
export async function guardAuthAttempt(
  kind: AuthAttemptKind,
  identifier: string,
): Promise<AuthAttemptDecision> {
  const policy = POLICIES[kind];
  const ip = await requestClientIp();
  const [ipAllowed, identifierWithinThreshold] = await Promise.all([
    checkRateLimit(
      `${kind}:ip:${ip}`,
      policy.ipLimit,
      policy.windowSeconds,
      { failClosed: true },
    ),
    checkRateLimit(
      `${kind}:identifier:${identifier}`,
      policy.identifierBackoffAt,
      policy.windowSeconds,
      { failClosed: true },
    ),
  ]);

  if (!ipAllowed) return { allowed: false, backedOff: false };

  if (!identifierWithinThreshold) {
    await new Promise((resolve) => setTimeout(resolve, IDENTIFIER_BACKOFF_MS));
    return { allowed: true, backedOff: true };
  }

  return { allowed: true, backedOff: false };
}
