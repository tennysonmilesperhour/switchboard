import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { DiscoverClient } from './DiscoverClient';
import {
  PeopleDiscoveryClient,
  type DiscoveryMatch,
} from './PeopleDiscoveryClient';
import { OpenTables } from '@/components/events/OpenTables';
import { VenuePerks } from '@/components/venues/VenuePerks';
import { IntentLaunchpad } from './IntentLaunchpad';

export const metadata: Metadata = { title: 'Explore' };

/** Long enough for any interest tag; short enough to keep a hand-edited URL sane. */
const MAX_FOCUS_LENGTH = 60;

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  // `?q=<interest>` is how the You page's "still waiting for a first outing"
  // tags arrive: it seeds the idea generator with that one interest. Untrusted,
  // so it is trimmed, capped, and only ever rendered as text.
  const { q } = await searchParams;
  const focusInterest =
    (Array.isArray(q) ? q[0] : q)?.trim().slice(0, MAX_FOCUS_LENGTH) || null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [
    { data: profile },
    { data: openTables },
    { data: venues },
    { data: myVenues },
    { data: people },
    { data: discoveryMatches },
  ] =
    await Promise.all([
      supabase.from('profiles').select('interests, discoverable').eq('id', user.id).single(),
      supabase.rpc('list_open_tables'),
      supabase
        .from('venues')
        .select('id, name, area, perk, url')
        .eq('status', 'verified')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('venues')
        .select('id, name, area, perk, url, status')
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
    ]);

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
            people={people ?? []}
            matches={matches}
            discoverable={Boolean(profile?.discoverable)}
          />
          <OpenTables tables={openTables ?? []} />
        </div>
        <VenuePerks
          venues={venues ?? []}
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
