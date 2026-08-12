import { createClient } from '@/lib/supabase/server';
import type { PassportState } from '@/lib/passport';

/**
 * Work out which passport stamps someone has earned, from what they already
 * did.
 *
 * Every answer is derived at read time — there is no progress table, no
 * counters to increment, and therefore nothing that can drift out of step with
 * reality or need keeping private on its own. The cost is one round of small
 * head-only counts, all fired together.
 *
 * Every query runs through the caller's own RLS client, so this can only ever
 * see the caller's own rows. That is deliberate: a progress surface that
 * reached for the admin client would be the one place in the app where "what
 * has this person done" is computed with the gloves off.
 */
export async function loadPassport(userId: string): Promise<PassportState> {
  const supabase = await createClient();

  const count = { count: 'exact' as const, head: true };
  const [
    plans,
    answered,
    votes,
    connections,
    circles,
    signals,
    moments,
    boards,
    zoneMemberships,
    messages,
  ] = await Promise.all([
    supabase.from('events').select('id', count).eq('host_id', userId),
    supabase
      .from('invites')
      .select('id', count)
      .eq('invitee_id', userId)
      .in('status', ['accepted', 'declined']),
    supabase.from('poll_votes').select('poll_id', count).eq('voter_id', userId),
    supabase
      .from('connections')
      .select('id', count)
      .eq('status', 'accepted')
      .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`),
    supabase.from('circles').select('id', count).eq('owner_id', userId),
    // Signals expire, and a stamp is permanent once earned — so this asks
    // "have you ever", not "are you free right now". An expired signal still
    // counts as having tried it.
    supabase.from('availability_signals').select('id', count).eq('user_id', userId),
    supabase.from('moments').select('id', count).eq('user_id', userId),
    supabase.from('board_members').select('board_id', count).eq('member_id', userId),
    supabase.from('zone_members').select('zone_id', count).eq('member_id', userId),
    supabase.from('messages').select('id', count).eq('sender_id', userId),
  ]);

  const any = (result: { count: number | null }) => (result.count ?? 0) > 0;

  return {
    'made-a-plan': any(plans),
    'answered-an-invite': any(answered),
    'weighed-in': any(votes),
    'added-someone': any(connections),
    'made-a-circle': any(circles),
    'said-youre-free': any(signals),
    'checked-in': any(moments),
    'joined-a-group': any(boards) || any(zoneMemberships),
    'said-something': any(messages),
  };
}
