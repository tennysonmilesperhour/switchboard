import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Whether `userId` may manage `eventId` — the primary host OR a co-host. This is
 * the one place that authorization lives; server actions call it before any
 * host-only mutation instead of re-issuing the `is_event_host` RPC inline.
 *
 * Uses the service-role client but passes the caller's id explicitly (never
 * `auth.uid()`, which is null under the service role) — see docs/SECURITY.md.
 */
export async function isEventManager(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.rpc('is_event_host', {
    p_event: eventId,
    p_user: userId,
  });
  return Boolean(data);
}
