import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Whether a host has a home point to measure range from. A broadcast with none
 * would reach no one and never say why, so it is refused up front.
 *
 * The home point is withheld from the session client's profile grant (see
 * docs/SECURITY.md), so the caller reads their own through the owner-only
 * `my_home_point` accessor, and an already-authorized manager reads the host's
 * with the service-role client the action has by then created.
 */
export async function callerHasHomeArea(supabase: SupabaseClient<Database>): Promise<boolean> {
  const { data } = await supabase.rpc('my_home_point').maybeSingle();
  return data != null;
}

export async function hostHasHomeArea(
  admin: SupabaseClient<Database>,
  hostId: string,
): Promise<boolean> {
  const { data } = await admin
    .from('profiles')
    .select('home_latitude, home_longitude')
    .eq('id', hostId)
    .maybeSingle();
  return data?.home_latitude != null && data?.home_longitude != null;
}
