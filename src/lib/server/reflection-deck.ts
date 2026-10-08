import { createClient } from '@/lib/supabase/server';
import { reportOperationalError } from '@/lib/server/observability';
import { isReflectable } from '@/lib/reflection-deck';

export interface DeckCard {
  id: string;
  title: string;
  startsAt: string | null;
  timeZone: string | null;
  place: string | null;
  role: 'host' | 'cohost' | 'guest';
}

const DECK_SIZE = 25;

/**
 * Past plans the caller took part in and has not yet swiped on, newest first.
 * Hosted, co-hosted, or said yes to: asking about a plan someone declined has
 * no answer. "Over" is `isReflectable`, so the page, the action and the tests
 * share one rule.
 */
export async function loadReflectionDeck(): Promise<{ cards: DeckCard[]; failed: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { cards: [], failed: false };

  const nowMs = Date.now();
  const cutoff = new Date(nowMs - 86_400_000).toISOString();

  const [invites, cohosts, done] = await Promise.all([
    supabase.from('invites').select('event_id').eq('invitee_id', user.id).eq('status', 'accepted'),
    supabase.from('event_cohosts').select('event_id').eq('cohost_id', user.id),
    supabase.from('event_reflections').select('event_id').eq('user_id', user.id),
  ]);
  const error = invites.error ?? cohosts.error ?? done.error;
  if (error) {
    await reportOperationalError('you.deck', error);
    return { cards: [], failed: true };
  }

  const guestIds = new Set((invites.data ?? []).map((r) => r.event_id));
  const cohostIds = new Set((cohosts.data ?? []).map((r) => r.event_id));
  const reflected = new Set((done.data ?? []).map((r) => r.event_id));
  // Ids come from our own rows (uuids), so they cannot carry filter syntax.
  const partOf = [...new Set([...guestIds, ...cohostIds])];
  const scope =
    partOf.length > 0
      ? `host_id.eq.${user.id},id.in.(${partOf.join(',')})`
      : `host_id.eq.${user.id}`;

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, title, starts_at, ends_at, happened_at, status, time_zone, location_name, host_id')
    .or(scope)
    .neq('status', 'cancelled')
    .or(`starts_at.lt.${cutoff},happened_at.not.is.null,status.eq.past`)
    .order('starts_at', { ascending: false, nullsFirst: false })
    .limit(DECK_SIZE + reflected.size);
  if (eventsError) {
    await reportOperationalError('you.deck', eventsError);
    return { cards: [], failed: true };
  }

  const cards = (events ?? [])
    .filter((e) => !reflected.has(e.id) && isReflectable(e, nowMs))
    .slice(0, DECK_SIZE)
    .map((e): DeckCard => ({
      id: e.id,
      title: e.title,
      startsAt: e.starts_at,
      timeZone: e.time_zone,
      place: e.location_name,
      role: e.host_id === user.id ? 'host' : cohostIds.has(e.id) ? 'cohost' : 'guest',
    }));
  return { cards, failed: false };
}
