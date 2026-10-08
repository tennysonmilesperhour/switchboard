import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import {
  loadMyIdentity,
  loadOperatorSettings,
  loadReflections,
  reflectionReady,
} from '@/lib/server/identity';
import { loadReflectionDeck } from '@/lib/server/reflection-deck';
import { YouClient } from './YouClient';

export const metadata: Metadata = { title: 'Your Read' };

// Behavioral signals change as you use the app; always recompute on visit.
export const dynamic = 'force-dynamic';

export default async function YouPage() {
  const user = await getUser();
  if (!user) redirect('/login');

  // Facets must compute first so reflection-readiness reflects this visit.
  const facets = await loadMyIdentity();
  const [settings, reflections, ready, deck] = await Promise.all([
    loadOperatorSettings(),
    loadReflections(),
    reflectionReady(),
    loadReflectionDeck(),
  ]);

  return (
    <AppShell title="Your Read" back="/profile">
      <YouClient
        facets={facets}
        settings={settings}
        reflections={reflections}
        reflectionReady={ready}
        deck={deck.cards}
        deckFailed={deck.failed}
      />
    </AppShell>
  );
}
