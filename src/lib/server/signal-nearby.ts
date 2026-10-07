import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { reportOperationalError } from '@/lib/server/observability';

/** Within a few kilometres: a walk, a short ride, "I could meet you". */
export const NEARBY_RADIUS_M = 5_000;
/** Nobody is told about the same person's statuses more than once in this window. */
export const NEARBY_COOLDOWN_HOURS = 3;

export interface NearbySignal {
  id: string;
  label: string;
}

/**
 * The words on the notification. Names the person and what they are up for, and
 * says nothing about where anyone is: not a distance, not a place.
 */
export function nearbyNotice(
  name: string,
  signals: readonly NearbySignal[],
  ownerId: string,
): { title: string; body: string; url: string } {
  const labels = [...new Set(signals.map((signal) => signal.label))];
  const shown = labels.slice(0, 2).join(' · ');
  const extra = labels.length > 2 ? ` +${labels.length - 2}` : '';
  return {
    title: `${name} is nearby`,
    body: `${shown}${extra}. Tap to say hi.`,
    url: `/rooms/with/${ownerId}`,
  };
}

/**
 * Tell the friends close to `ownerId` that they just turned on a status.
 *
 * Who is told is decided by one database function
 * (`claim_signal_nearby_recipients`): friends the status is actually offered
 * to, who chose to be discoverable, and who are both sharing a live location
 * that is still being heard from. It claims each pair at most once per cooldown
 * in the same statement, so a status toggled on and off rings nobody twice. It
 * returns ids only; this code never sees a coordinate or a distance.
 *
 * Best effort, run after the status has saved: a failure here is logged and
 * never undoes or delays turning a status on.
 */
export async function notifyNearbyFriends(
  ownerId: string,
  signals: readonly NearbySignal[],
): Promise<number> {
  if (signals.length === 0) return 0;
  try {
    const admin = createAdminClient();
    const { data: recipients, error } = await admin.rpc('claim_signal_nearby_recipients', {
      p_owner: ownerId,
      p_signal_ids: signals.map((signal) => signal.id),
      p_radius_m: NEARBY_RADIUS_M,
      p_cooldown: `${NEARBY_COOLDOWN_HOURS} hours`,
    });
    if (error) {
      await reportOperationalError('signal.notify-nearby', error, { ownerId }, 'SB-SIGNAL-NOTIFY');
      return 0;
    }
    const ids = (recipients ?? []) as string[];
    if (ids.length === 0) return 0;

    const { data: owner } = await admin
      .from('profiles')
      .select('display_name')
      .eq('id', ownerId)
      .maybeSingle();
    const notice = nearbyNotice(owner?.display_name || 'A friend', signals, ownerId);
    await notifyUsers(ids, { kind: 'signal_nearby', ...notice });
    return ids.length;
  } catch (error) {
    await reportOperationalError('signal.notify-nearby', error, { ownerId }, 'SB-SIGNAL-NOTIFY');
    return 0;
  }
}
