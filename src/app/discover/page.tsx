import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { DiscoverClient } from './DiscoverClient';

export const metadata: Metadata = { title: 'Discover' };

export default async function DiscoverPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('interests')
    .eq('id', user.id)
    .single();

  return (
    <AppShell title="Discover">
      <DiscoverClient defaultInterests={profile?.interests ?? []} />
    </AppShell>
  );
}
