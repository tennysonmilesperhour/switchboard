import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { DiscoverClient } from './DiscoverClient';
import { OpenTables, type OpenTableRow } from '@/components/events/OpenTables';
import { VenuePerks, type VenueRow } from '@/components/venues/VenuePerks';

export const metadata: Metadata = { title: 'Explore' };

export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: openTables }, { data: venues }] =
    await Promise.all([
      supabase.from('profiles').select('interests').eq('id', user.id).single(),
      supabase.rpc('list_open_tables'),
      supabase
        .from('venues')
        .select('id, name, area, perk')
        .order('created_at', { ascending: false })
        .limit(10),
    ]);

  return (
    <AppShell title="Explore">
      <div className="space-y-8">
        <OpenTables tables={(openTables ?? []) as OpenTableRow[]} />
        <DiscoverClient defaultInterests={profile?.interests ?? []} />
        <VenuePerks venues={(venues ?? []) as VenueRow[]} />
      </div>
    </AppShell>
  );
}
