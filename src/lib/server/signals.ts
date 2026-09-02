import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

/** What someone is currently up for, as far as this viewer is allowed to know. */
export interface VisibleSignal {
  emoji: string;
  label: string;
}

/**
 * The live signal for each of `userIds`, keyed by user id.
 *
 * **Read through the caller's own client, never the admin client.** The
 * `signals_visible` policy already encodes the whole audience rule — connected,
 * unexpired, and either broadcast to everyone or to a circle the viewer is in
 * (`viewer_in_signal_audience`). Re-deriving any of that here would be a second
 * copy of a privacy rule, and the second copy is the one that drifts. Passing
 * the viewer's client means a signal the viewer may not see simply is not
 * returned, by the same policy that governs every other read of this table.
 *
 * Someone can hold more than one live signal; the soonest to expire wins,
 * because that is the one that is actually about right now.
 */
export async function loadVisibleSignals(
  supabase: SupabaseClient<Database>,
  userIds: string[],
): Promise<Record<string, VisibleSignal>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return {};

  const { data } = await supabase
    .from('availability_signals')
    .select('user_id, emoji, label, expires_at')
    .in('user_id', ids)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at');

  const byUser: Record<string, VisibleSignal> = {};
  for (const row of data ?? []) {
    const userId = row.user_id;
    // First wins: the query is ordered by soonest expiry.
    if (byUser[userId]) continue;
    byUser[userId] = { emoji: row.emoji, label: row.label };
  }
  return byUser;
}
