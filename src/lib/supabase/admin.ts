import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client — bypasses RLS. Server-only: import exclusively from
 * route handlers, server actions, or cron jobs. Never expose to the client.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Supabase admin credentials are not configured');
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
