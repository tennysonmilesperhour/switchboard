import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { errorFor } from '@/lib/errors';
import { reportOperationalError } from '@/lib/server/observability';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Message' };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Where a status, or a "is nearby" notification, leads: straight into a
 * conversation with that person.
 *
 * Opening the conversation is the database's decision (`open_signal_chat`): it
 * needs a live status the viewer can actually see, or a thread the two already
 * share, and it refuses a blocked or suspended person. This page only asks and
 * follows the answer. When the answer is "no" the person is told what is true,
 * since the usual cause is a status that ended between the tap and now, and is
 * still offered the one thing they can do about it.
 */
export default async function MessageFromStatusPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  if (!UUID_PATTERN.test(userId)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: roomId, error } = await supabase.rpc('open_signal_chat', { p_other: userId });
  if (error) {
    await reportOperationalError('signal.open-chat', error, { userId: user.id }, 'SB-SIGNAL-CHAT');
    return (
      <AppShell title="Message" back="/">
        <ErrorNotice
          code="SB-SIGNAL-CHAT"
          message={errorFor('SB-SIGNAL-CHAT').message}
          fix={errorFor('SB-SIGNAL-CHAT').fix}
        />
      </AppShell>
    );
  }
  if (roomId) redirect(`/rooms/${roomId}`);

  return (
    <AppShell title="Message" back="/">
      <EmptyState
        emoji="💬"
        title="That status has ended"
        body="Statuses turn themselves off after a few hours. If you still want to see them, make a plan and they will be invited."
        action={
          <Link
            href={`/events/new?invite=${userId}`}
            className="inline-flex min-h-11 items-center rounded-pill bg-brand-gradient px-5 text-sm font-bold text-white shadow-lift"
          >
            Make a plan
          </Link>
        }
      />
    </AppShell>
  );
}
