import { createHash } from 'node:crypto';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!hasAdminCredentials()) return true;

  const keyHash = createHash('sha256').update(key).digest('hex');
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('consume_rate_limit', {
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[rate-limit:error]', error);
    return true;
  }
  return data === true;
}
