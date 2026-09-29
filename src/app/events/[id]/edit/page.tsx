import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { requireUserOrRedirect } from '@/lib/server/require-user';
import { isEventManager } from '@/lib/server/authz';
import { reportOperationalError } from '@/lib/server/observability';
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

  // The questions already asked, shown so a host adds rather than repeats.
  const { data: questions, error: questionsError } = await supabase
    .from('event_questions')
    .select('prompt')
    .eq('event_id', id)
    .order('position');
  // A failed read must not look like a plan that asks nothing: adding would
  // then be offered past the limit the server holds.
  if (questionsError) {
    await reportOperationalError('plans.load', questionsError, { eventId: id, step: 'edit-questions' });
    throw new Error('Could not load this plan’s questions');
  }

  return (
    <AppShell title="Edit plan" back={`/events/${id}`}>
      <EventEditForm
        event={event}
        userId={user.id}
        existingQuestions={(questions ?? []).map((question) => question.prompt)}
      />
    </AppShell>
  );
}
