import type { createClient } from '@/lib/supabase/server';
import { CREW_DAYS, crewPlanHref, groupCrews, MIN_CREW } from '@/lib/same-crew';

export interface CrewCardData {
  eventId: string;
  eventTitle: string;
  members: Array<{ id: string; name: string }>;
  href: string;
}

/**
 * Crews for Home: two or more people from one plan who each matched with the
 * caller on "hang out again". Everything is read through the caller's own
 * session: matches_select shows only their matches, and a profile or plan the
 * caller can no longer see simply drops out.
 */
export async function loadSameCrews(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  now: Date = new Date(),
): Promise<{ crews: CrewCardData[]; error: unknown }> {
  const since = new Date(now.getTime() - CREW_DAYS * 86_400_000).toISOString();
  const { data: matchRows, error } = await supabase
    .from('matches')
    .select('user_a, user_b, event_id, created_at')
    .eq('kind', 'hang_again')
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .gte('created_at', since);
  if (error) return { crews: [], error };
  const matches = (matchRows ?? []).map((row) => ({
    otherId: row.user_a === userId ? row.user_b : row.user_a,
    eventId: row.event_id,
    createdAt: row.created_at,
  }));
  if (matches.length < MIN_CREW) return { crews: [], error: null };

  // Plans the caller has made since the earliest of these matches, and who was
  // on them: a crew you already invited somewhere is not offered again.
  const earliest = matches.reduce((min, m) => (m.createdAt < min ? m.createdAt : min), matches[0].createdAt);
  const { data: planned, error: plannedError } = await supabase
    .from('events')
    .select('id, created_at, invites(invitee_id)')
    .eq('host_id', userId)
    .gte('created_at', earliest);
  if (plannedError) return { crews: [], error: plannedError };
  const plannedSince = (planned ?? []).map((plan) => ({
    createdAt: plan.created_at,
    inviteeIds: (plan.invites ?? [])
      .map((invite: { invitee_id: string | null }) => invite.invitee_id)
      .filter((id): id is string => Boolean(id)),
  }));

  const crews = groupCrews(matches, plannedSince, now);
  if (crews.length === 0) return { crews: [], error: null };

  const memberIds = [...new Set(crews.flatMap((crew) => crew.memberIds))];
  const [{ data: people, error: peopleError }, { data: events, error: eventsError }] = await Promise.all([
    supabase.from('profiles').select('id, display_name').in('id', memberIds),
    supabase.from('events').select('id, title').in('id', crews.map((crew) => crew.eventId)),
  ]);
  if (peopleError || eventsError) return { crews: [], error: peopleError ?? eventsError };
  const names = new Map((people ?? []).map((p) => [p.id, p.display_name || 'Someone']));
  const titles = new Map((events ?? []).map((e) => [e.id, e.title]));

  const cards: CrewCardData[] = [];
  for (const crew of crews) {
    const members = crew.memberIds
      .filter((id) => names.has(id))
      .map((id) => ({ id, name: names.get(id) as string }));
    const title = titles.get(crew.eventId);
    if (members.length < MIN_CREW || !title) continue;
    cards.push({
      eventId: crew.eventId,
      eventTitle: title,
      members,
      href: crewPlanHref(
        members.map((m) => m.id),
        `${title} again`,
      ),
    });
  }
  return { crews: cards.slice(0, 2), error: null };
}
