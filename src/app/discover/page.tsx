import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { DiscoverClient } from './DiscoverClient';
import {
  PeopleDiscoveryClient,
  type DiscoveryMatch,
  type DiscoveryPerson,
} from './PeopleDiscoveryClient';
import { OpenTables, type OpenTableRow } from '@/components/events/OpenTables';
import { VenuePerks, type VenueRow, type VenueClaim } from '@/components/venues/VenuePerks';
import { IntentLaunchpad } from './IntentLaunchpad';

export const metadata: Metadata = { title: 'Explore' };

export default async function DiscoverPage() {
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
        <div id="browse">
        <PeopleDiscoveryClient
          people={(people ?? []) as DiscoveryPerson[]}
          matches={matches}
          discoverable={Boolean(profile?.discoverable)}
        />
        <OpenTables tables={(openTables ?? []) as OpenTableRow[]} />
        </div>
        <div id="brainstorm">
        <DiscoverClient defaultInterests={profile?.interests ?? []} />
        </div>
        <VenuePerks
          venues={(venues ?? []) as VenueRow[]}
          myClaims={(myVenues ?? []) as VenueClaim[]}
        />
      </div>
    </AppShell>
  );
}
