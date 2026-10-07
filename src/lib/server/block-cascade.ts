import 'server-only';

import type { createClient } from '@/lib/supabase/server';
import { reportAndFail } from '@/lib/server/observability';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Both directions: `connections` is unique per direction, not per pair. */
function pairFilter(a: string, b: string): string {
  if (!UUID_RE.test(a) || !UUID_RE.test(b)) throw new Error('Expected a UUID');
  return `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`;
}

/**
 * What a block takes with it, whichever surface it came from: the connection
 * in both directions, and the person's place in the blocker's circles and
 * households. Returns a failure to hand back, or null when everything went.
 */
export async function removeBlockedFromMyGroups(
  supabase: SupabaseServerClient,
  userId: string,
  profileId: string,
): Promise<Awaited<ReturnType<typeof reportAndFail>> | null> {
  const { error: unlinkError } = await supabase
    .from('connections')
    .delete()
    .or(pairFilter(userId, profileId));
  if (unlinkError) {
    return reportAndFail('SB-CONNECTION-SAVE', 'connection.block', unlinkError, { profileId });
  }
  // They leave your circles too, so a later unblock doesn't silently restore
  // them to groups you curated. circle_members is owner-only under RLS.
  const { data: myCircles } = await supabase.from('circles').select('id').eq('owner_id', userId);
  const circleIds = (myCircles ?? []).map((circle) => circle.id);
  if (circleIds.length > 0) {
    const { error } = await supabase
      .from('circle_members')
      .delete()
      .in('circle_id', circleIds)
      .eq('member_id', profileId);
    if (error) {
      return reportAndFail('SB-CONNECTION-SAVE', 'connection.block', error, { profileId, step: 'circles' });
    }
  }
  // Households are the same kind of curated group: a blocked person stayed
  // filed in yours, and was back in every household invite after a reconnect.
  const { data: myHouseholds } = await supabase.from('households').select('id').eq('owner_id', userId);
  const householdIds = (myHouseholds ?? []).map((household) => household.id);
  if (householdIds.length > 0) {
    const { error } = await supabase
      .from('household_members')
      .delete()
      .in('household_id', householdIds)
      .eq('member_id', profileId);
    if (error) {
      return reportAndFail('SB-CONNECTION-SAVE', 'connection.block', error, { profileId, step: 'households' });
    }
  }
  return null;
}

