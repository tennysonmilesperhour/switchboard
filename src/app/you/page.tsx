import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { loadMyIdentity } from '@/lib/server/identity';
import { YouClient } from './YouClient';

export const metadata: Metadata = { title: 'Your Read' };

// Behavioral signals change as you use the app; always recompute on visit.
export const dynamic = 'force-dynamic';

export default async function YouPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  const facets = await loadMyIdentity();

  return (
    <AppShell title="Your Read" back="/profile">
      <YouClient facets={facets} />
    </AppShell>
  );
}
