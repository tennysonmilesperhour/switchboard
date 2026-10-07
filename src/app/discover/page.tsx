import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { DiscoverClient } from './DiscoverClient';
import { ExploreClient, type ExplorePlan, type ExploreMode } from './ExploreClient';
import type { DiscoveryMatch } from './types';
import type { PendingJoinRequest } from '@/components/events/OpenTables';
import { VenuePerks } from '@/components/venues/VenuePerks';
import { isDistanceBand, type DistanceBand } from '@/lib/nearby-plans';
import { supportEmail } from '@/lib/contact';
import { venueAreaKey } from '@/lib/venue-area';
import { ownContexts } from '@/lib/discovery-context';
import { ilikeTerm } from '@/lib/zone-rules';
import { reportOperationalError } from '@/lib/server/observability';
import type { ErrorCode } from '@/lib/errors';

export const metadata: Metadata = { title: 'Explore' };

/** Long enough for any interest tag; short enough to keep a hand-edited URL sane. */
const MAX_FOCUS_LENGTH = 60;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; mode?: string | string[] }>;
}) {
  // `?q=<interest>` is how the You page's "still waiting for a first outing"
  // tags arrive: it seeds the idea generator with that one interest. Untrusted,
  // so it is trimmed, capped, and only ever rendered as text.
  const { q, mode: modeParam } = await searchParams;
  // `?mode=people` opens the People side; anything else is Plans, the side
  // Explore is named for.
  const initialMode: ExploreMode =
    (Array.isArray(modeParam) ? modeParam[0] : modeParam) === 'people' ? 'people' : 'plans';
  const focusInterest =
    (Array.isArray(q) ? q[0] : q)?.trim().slice(0, MAX_FOCUS_LENGTH) || null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // The viewer's own profile decides two scopes below: whether they may browse
  // people at all (D13 — the database enforces it too) and which area's partner
  // perks they see (D14).
  const { data: profile } = await supabase
    .from('profiles')
    .select('interests, discoverable, location, discovery_contexts, down_to')
    .eq('id', user.id)
    .single();
  const area = venueAreaKey(profile?.location);
  const areaTerm = area ? ilikeTerm(area) : '';

  const [
    { data: openTables },
    nearbyPlansResult,
    { data: homePoint },
    bandsResult,
    venuesResult,
    { data: myVenues },
    peopleResult,
    { data: discoveryMatches },
    { data: myInterests },
    myRequestsResult,
  ] =
    await Promise.all([
      supabase.rpc('list_open_tables'),
      // Plans hosts chose to show to people in range, strangers included.
      // Fetched out to the widest band; the client narrows by the range picked.
      supabase.rpc('list_nearby_plans', { p_max_km: 100 }),
      // Range is measured from the reader's city, never a device fix.
      supabase.rpc('my_home_point').maybeSingle<{ latitude: number; longitude: number }>(),
      supabase.rpc('list_people_distance_bands'),
      // Verified perks in the viewer's area, newest first. This was the ten
      // newest verified venues anywhere in the world.
      areaTerm
        ? supabase
            .from('venues')
            .select('id, name, area, perk, url')
            .eq('status', 'verified')
            .ilike('area', `%${areaTerm}%`)
            .order('created_at', { ascending: false })
            .limit(10)
        : Promise.resolve({ data: [], error: null }),
      supabase
        .from('venues')
        .select('id, name, area, perk, url, status, review_note, reviewed_at')
        .eq('claimed_by', user.id)
        .order('created_at', { ascending: false }),
      supabase.rpc('list_discoverable_people', { p_category: 'all' }),
      supabase
        .from('matches')
        .select('id, user_a, user_b, activity, room_id, created_at')
        .eq('kind', 'discover_connect')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(6),
      // The reader's own open "Interested" marks, so a card can say so and
      // offer to take it back. RLS returns only the author's intents.
      supabase
        .from('mutual_intents')
        .select('id, target_id, activity')
        .eq('author_id', user.id)
        .eq('kind', 'discover_connect')
        .eq('status', 'active'),
      // The reader's own Open Table requests still waiting on a host (G20).
      // `invites_select` lets an invitee read their own non-queued rows, and
      // `can_view_event` lets a requester read the plan they asked to join.
      supabase
        .from('invites')
        .select('id, event:events(id, title, starts_at, time_zone)')
        .eq('invitee_id', user.id)
        .eq('status', 'requested')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  // A failed lookup must not read as an empty room ("No one in this lane
  // yet"), so it is logged with its code and shown as a failure.
  let peopleError: ErrorCode | null = null;
  if (peopleResult.error) {
    await reportOperationalError('discover.people', peopleResult.error, {}, 'SB-PEOPLE-LOAD');
    peopleError = 'SB-PEOPLE-LOAD';
  }
  let plansError: ErrorCode | null = null;
  if (nearbyPlansResult.error) {
    await reportOperationalError('discover.nearby-plans', nearbyPlansResult.error, {}, 'SB-PLANS-LOAD');
    plansError = 'SB-PLANS-LOAD';
  }
  // A failed band lookup must not read as "nobody is near you": without bands
  // every person lacks a placeable city, so say so rather than empty the deck.
  if (bandsResult.error) {
    await reportOperationalError('discover.people-bands', bandsResult.error, {}, 'SB-PEOPLE-LOAD');
    peopleError = 'SB-PEOPLE-LOAD';
  }
  let venuesError: ErrorCode | null = null;
  if (venuesResult.error) {
    await reportOperationalError('venue.load', venuesResult.error, {}, 'SB-VENUE-LOAD');
    venuesError = 'SB-VENUE-LOAD';
  }
  let requestsError: ErrorCode | null = null;
  if (myRequestsResult.error) {
    await reportOperationalError('discover.join-requests', myRequestsResult.error, {}, 'SB-INVITE-LOAD');
    requestsError = 'SB-INVITE-LOAD';
  }
  const myRequests: PendingJoinRequest[] = (myRequestsResult.data ?? []).flatMap((row) => {
    const event = Array.isArray(row.event) ? row.event[0] : row.event;
    return event
      ? [{
          inviteId: row.id,
          eventId: event.id,
          title: event.title,
          startsAt: event.starts_at,
          timeZone: event.time_zone,
        }]
      : [];
  });
  const hasHomePoint = Boolean(homePoint);
  const plans: ExplorePlan[] = [];
  const seenPlans = new Set<string>();
  for (const row of nearbyPlansResult.data ?? []) {
    seenPlans.add(row.event_id);
    plans.push({
      eventId: row.event_id,
      title: row.title,
      startsAt: row.starts_at,
      timeZone: row.time_zone,
      hostName: row.host_name,
      spotsLeft: row.spots_left,
      knownVia: row.known_via,
      band: isDistanceBand(row.distance_band) ? row.distance_band : 'wider',
    });
  }
  // Friends-of-friends tables the host did not broadcast: no place to measure.
  for (const row of openTables ?? []) {
    if (seenPlans.has(row.event_id)) continue;
    plans.push({
      eventId: row.event_id,
      title: row.title,
      startsAt: row.starts_at,
      timeZone: row.time_zone,
      hostName: row.host_name,
      spotsLeft: row.spots_left,
      knownVia: row.known_via,
      band: null,
    });
  }
  const bands: Record<string, DistanceBand> = {};
  for (const row of bandsResult.data ?? []) {
    if (isDistanceBand(row.distance_band)) bands[row.person_id] = row.distance_band;
  }
  const people = peopleResult.data;
  const venues = venuesResult.data;
  const interestByTarget = Object.fromEntries(
    (myInterests ?? [])
      .filter((intent) => intent.target_id)
      .map((intent) => [intent.target_id as string, { id: intent.id, activity: intent.activity }]),
  );

  const matchRows = discoveryMatches ?? [];
  const otherIds = [
    ...new Set(matchRows.map((match) => (match.user_a === user.id ? match.user_b : match.user_a))),
  ];
  const { data: matchProfiles } = otherIds.length
    ? await supabase.from('profiles').select('id, display_name').in('id', otherIds)
    : { data: [] };
  const nameById = new Map((matchProfiles ?? []).map((p) => [p.id, p.display_name]));
  const matches: DiscoveryMatch[] = matchRows.map((match) => {
    const otherId = match.user_a === user.id ? match.user_b : match.user_a;
    return {
      id: match.id,
      otherId,
      otherName: nameById.get(otherId) ?? 'Someone',
      activity: match.activity,
      roomId: match.room_id,
      createdAt: match.created_at,
    };
  });

  return (
    <AppShell title="Explore">
      <ExploreClient
        initialMode={initialMode}
        initialRange={hasHomePoint ? 'nearby' : 'any'}
        hasHomePoint={hasHomePoint}
        plans={plans}
        plansError={plansError}
        requests={myRequests}
        requestsError={requestsError}
        people={people ?? []}
        bands={bands}
        matches={matches}
        discoverable={Boolean(profile?.discoverable)}
        interests={interestByTarget}
        myContexts={ownContexts(profile?.discovery_contexts, profile?.down_to)}
        peopleError={peopleError}
        plansFooter={
          <div className="space-y-8">
            <div id="brainstorm" className="scroll-mt-20">
              <DiscoverClient
                key={focusInterest ?? ''}
                defaultInterests={profile?.interests ?? []}
                focusInterest={focusInterest}
              />
            </div>
            <VenuePerks
              venues={venues ?? []}
              area={area}
              loadError={venuesError}
              supportEmail={supportEmail()}
              myClaims={(myVenues ?? []).map((venue) => ({
                ...venue,
                status:
                  venue.status === 'verified' || venue.status === 'rejected'
                    ? venue.status
                    : 'pending',
              }))}
            />
          </div>
        }
      />
    </AppShell>
  );
}
