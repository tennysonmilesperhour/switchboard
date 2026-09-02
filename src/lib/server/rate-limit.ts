import { createHash } from 'node:crypto';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { reportOperationalError } from '@/lib/server/observability';

export interface RateLimitOptions {
  /** Refuse the operation when limiter state cannot be read. */
  failClosed?: boolean;
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  options: RateLimitOptions = {},
): Promise<boolean> {
  if (!hasAdminCredentials()) return !options.failClosed;

  const keyHash = createHash('sha256').update(key).digest('hex');
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    await reportOperationalError('rate-limit', error, {
      scope: key.split(':', 1)[0],
      failClosed: Boolean(options.failClosed),
    });
    return !options.failClosed;
  }
  return data === true;
}
