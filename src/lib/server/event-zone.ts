import type { createAdminClient } from '@/lib/supabase/admin';

/** True when `zone` is an IANA name this runtime recognizes. */
export function isValidTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * The zone to render a fetched event's `starts_at` in, or null to leave it to
 * the runtime. Prefers the zone captured on the event; for plans created before
 * that column existed, falls back to the host's profile zone. Only ever returns
 * a zone this runtime accepts, so callers can format without guarding.
 *
 * `event` may be null (missing/undated plan), in which case there's nothing to
 * render and we return null without a query.
 */
export async function resolveEventZone(
  admin: ReturnType<typeof createAdminClient>,
  event: { time_zone?: string | null; host_id?: string | null } | null,
): Promise<string | null> {
  if (!event) return null;
  if (isValidTimeZone(event.time_zone)) return event.time_zone;
  if (!event.host_id) return null;
  const { data: host } = await admin
    .from('profiles')
    .select('timezone')
    .eq('id', event.host_id)
    .maybeSingle();
  return isValidTimeZone(host?.timezone) ? host.timezone : null;
}
