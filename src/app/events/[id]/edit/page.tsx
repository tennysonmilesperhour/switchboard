import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUserOrRedirect } from '@/lib/server/require-user';
import { isEventManager } from '@/lib/server/authz';
import { AppShell } from '@/components/shell/AppShell';
import { EventEditForm } from './EventEditForm';

export const metadata: Metadata = { title: 'Edit plan' };

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireUserOrRedirect();

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single();
  if (!event) notFound();

  // Host or co-host only — same authorization as the server actions.
  if (!(await isEventManager(user.id, id))) redirect(`/events/${id}`);
  if (event.status === 'cancelled' || event.status === 'past') redirect(`/events/${id}`);

  return (
    <AppShell title="Edit plan" back={`/events/${id}`}>
      <EventEditForm event={event} />
    </AppShell>
  );
}
