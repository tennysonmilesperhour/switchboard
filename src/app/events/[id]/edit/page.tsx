import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { AppShell } from '@/components/shell/AppShell';
import { EventEditForm } from './EventEditForm';
import type { SwitchboardEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Edit plan' };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single<SwitchboardEvent>();
  if (!event) notFound();

  // Host or co-host only (RPC mirrors the server action's authorization).
  const admin = createAdminClient();
  const { data: canManage } = await admin.rpc('is_event_host', {
    p_event: id,
    p_user: user.id,
  });
  if (!canManage) redirect(`/events/${id}`);
  if (event.status === 'cancelled' || event.status === 'past') redirect(`/events/${id}`);

  return (
    <AppShell title="Edit plan" back={`/events/${id}`}>
      <EventEditForm event={event} />
    </AppShell>
  );
}
