import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { DiscoverClient } from './DiscoverClient';
import {
  PeopleDiscoveryClient,
  type DiscoveryMatch,
} from './PeopleDiscoveryClient';
import { OpenTables, type PendingJoinRequest } from '@/components/events/OpenTables';
import { VenuePerks } from '@/components/venues/VenuePerks';
import { IntentLaunchpad } from './IntentLaunchpad';
import { supportEmail } from '@/lib/contact';
import { venueAreaKey } from '@/lib/venue-area';
import { ownContexts } from '@/lib/discovery-context';
import { toDiscoveryPerson } from '@/lib/discovery-people';
import { isSelf, laneOfActivity, moodIsActive, type Self } from '@/lib/discovery-lanes';
import { ilikeTerm } from '@/lib/zone-rules';
import { reportOperationalError } from '@/lib/server/observability';
import type { ErrorCode } from '@/lib/errors';
import { ExternalEventList, type ExternalEventCard } from '@/components/events/ExternalEventList';

export const metadata: Metadata = { title: 'Explore' };

/** Long enough for any interest tag; short enough to keep a hand-edited URL sane. */
const MAX_FOCUS_LENGTH = 60;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; lane?: string | string[] }>;
}) {
  // `?q=<interest>` is how the You page's "still waiting for a first outing"
  // tags arrive: it seeds the idea generator with that one interest. Untrusted,
  // so it is trimmed, capped, and only ever rendered as text.
  const { q, lane } = await searchParams;
  const laneParam = Array.isArray(lane) ? lane[0] : lane;
  const self: Self = isSelf(laneParam) ? laneParam : 'friends';
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
  const externalEventsResult = await supabase
    .from('external_events')
    .select('id,title,description,starts_at,venue_name,city,category,canonical_url,ticket_url,price_label')
    .gte('ends_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(24);

  const [
    { data: openTables },
    venuesResult,
    { data: myVenues },
    peopleResult,
    { data: discoveryMatches },
    { data: myInterests },
    myRequestsResult,
    { data: moodRow },
    { data: laneRow },
  ] =
    await Promise.all([
      supabase.rpc('list_open_tables'),
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
      supabase.rpc('list_discovery_candidates', { p_self: self }),
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
      // Own mood and own lane settings, so the page can say why it looks the
      // way it does. Both are owner-only under RLS.
      supabase
        .from('discovery_mood')
        .select('preset, bar_shift, only_selves, include_items, expires_at')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle(),
      supabase
        .from('discovery_selves')
        .select('enabled')
        .eq('user_id', user.id)
        .eq('self', self)
        .maybeSingle(),
    ]);

  // A failed lookup must not read as an empty room ("No one in this lane
  // yet"), so it is logged with its code and shown as a failure.
  let peopleError: ErrorCode | null = null;
  if (peopleResult.error) {
    await reportOperationalError('discover.people', peopleResult.error, {}, 'SB-PEOPLE-LOAD');
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
  const people = peopleResult.data;
  const venues = venuesResult.data;
  const interestByTarget = Object.fromEntries(
    (myInterests ?? [])
      .filter((intent) => intent.target_id && laneOfActivity(intent.activity) === self)
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
      <div className="space-y-8">
        <IntentLaunchpad />
        <ExternalEventList events={(externalEventsResult.data ?? []) as ExternalEventCard[]} />
        {/* Ideas first: it is what Explore is named for, and the door on
            /create that leads here promises "browse ideas". */}
        <div id="brainstorm" className="scroll-mt-20">
          <DiscoverClient
            key={focusInterest ?? ''}
            defaultInterests={profile?.interests ?? []}
            focusInterest={focusInterest}
          />
        </div>
        <div id="browse" className="scroll-mt-20 space-y-8">
          <PeopleDiscoveryClient
            people={(people ?? []).map(toDiscoveryPerson)}
            matches={matches}
            discoverable={Boolean(profile?.discoverable)}
            self={self}
            // No row means the friends lane follows the discoverable switch and
            // the others are off, exactly as the database reads it.
            laneOn={laneRow ? laneRow.enabled : self === 'friends' && Boolean(profile?.discoverable)}
            mood={moodRow && moodIsActive(moodRow) ? moodRow : null}
            interests={interestByTarget}
            myContexts={ownContexts(profile?.discovery_contexts, profile?.down_to)}
            loadError={peopleError}
          />
          <OpenTables
            tables={openTables ?? []}
            requests={myRequests}
            requestsError={requestsError}
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
    </AppShell>
  );
}
