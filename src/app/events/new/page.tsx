import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { EventWizard, type WizardFriend } from './EventWizard';

export const metadata: Metadata = { title: 'New plan' };

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; description?: string }>;
}) {
  const { title, description } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: connections } = await supabase
    .from('connections')
    .select(
      'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle, avatar_url), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle, avatar_url)',
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);

  const friends: WizardFriend[] = (connections ?? []).map((connection) => {
    const other =
      connection.requester_id === user.id
        ? connection.addressee
        : connection.requester;
    const profile = Array.isArray(other) ? other[0] : other;
    return {
      id: profile.id,
      name: profile.display_name,
      handle: profile.handle ?? '',
    };
  });

  return (
    <AppShell title="New plan" back="/plans">
      <EventWizard
        friends={friends}
        initialTitle={title ?? ''}
        initialDescription={description ?? ''}
      />
    </AppShell>
  );
}
