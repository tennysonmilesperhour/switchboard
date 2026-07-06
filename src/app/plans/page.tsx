import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { SectionHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { formatDateTime } from '@/lib/format';
import type { SwitchboardEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Calendar' };

const STATUS_LABELS: Record<string, string> = {
  deciding: 'Deciding',
  inviting: 'Inviting',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
};

function EventCard({
  event,
  index,
  note,
}: {
  event: SwitchboardEvent;
  index: number;
  note?: string;
}) {
  return (
    <PlanCard
      variant="compact"
      href={`/events/${event.id}`}
      title={event.title}
      color={planColor(index)}
      when={formatDateTime(event.starts_at)}
      where={event.location_name ?? undefined}
      dateLabel={note ?? STATUS_LABELS[event.status] ?? event.status}
    />
  );
}

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: hosting }, { data: inviteRows }] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('host_id', user.id)
      .not('status', 'in', '("past","cancelled")')
      .order('starts_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('invites')
      .select('status, event:events(*)')
      .eq('invitee_id', user.id)
      .in('status', ['sent', 'accepted', 'waitlisted']),
  ]);

  const invited = (inviteRows ?? [])
    .map((row) => ({
      status: row.status,
      event: (Array.isArray(row.event) ? row.event[0] : row.event) as SwitchboardEvent | null,
    }))
    .filter(
      (row): row is { status: string; event: SwitchboardEvent } =>
        row.event !== null &&
        row.event.host_id !== user.id &&
        !['past', 'cancelled'].includes(row.event.status),
    );

  const needsResponse = invited.filter((i) => i.status === 'sent');
  const going = invited.filter((i) => i.status !== 'sent');

  const isEmpty =
    (hosting?.length ?? 0) === 0 && invited.length === 0;

  return (
    <AppShell title="Coming up">
      {isEmpty ? (
        <EmptyState
          emoji="✦"
          title="Nothing on the calendar"
          body="Start a plan and let Switchboard handle the asking. One person or twenty - no group-chat chaos."
          action={
            <Link href="/events/new">
              <Button>Make a plan</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-7">
          {needsResponse.length > 0 && (
            <section>
              <SectionHeader title="Waiting on you" hint="These invitations have a timer" />
              <div className="space-y-3">
                {needsResponse.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Respond soon" />
                ))}
              </div>
            </section>
          )}
          {(hosting?.length ?? 0) > 0 && (
            <section>
              <SectionHeader title="Hosting" />
              <div className="space-y-3">
                {(hosting as SwitchboardEvent[]).map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            </section>
          )}
          {going.length > 0 && (
            <section>
              <SectionHeader title="Going" />
              <div className="space-y-3">
                {going.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
