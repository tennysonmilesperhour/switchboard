import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { formatDateTime } from '@/lib/format';
import type { SwitchboardEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Plans' };

const STATUS_BADGES: Record<string, string> = {
  deciding: '🗳️ deciding',
  inviting: '🪜 inviting',
  confirmed: '✓ confirmed',
  cancelled: 'cancelled',
};

function EventCard({
  event,
  note,
}: {
  event: SwitchboardEvent;
  note?: string;
}) {
  return (
    <Link href={`/events/${event.id}`} className="block group">
      <Card className="group-hover:border-terracotta transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg truncate">{event.title}</p>
            <p className="text-sm text-ink-soft mt-0.5">
              {formatDateTime(event.starts_at)}
              {event.location_name ? ` · ${event.location_name}` : ''}
            </p>
            {note && <p className="text-xs text-terracotta-deep mt-1">{note}</p>}
          </div>
          <span className="text-xs text-ink-faint whitespace-nowrap rounded-pill bg-cream px-2.5 py-1">
            {STATUS_BADGES[event.status] ?? event.status}
          </span>
        </div>
      </Card>
    </Link>
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
    <AppShell
      title="Plans"
      action={
        <Link href="/events/new">
          <Button size="sm">+ New plan</Button>
        </Link>
      }
    >
      {isEmpty ? (
        <EmptyState
          emoji="✦"
          title="Nothing on the calendar"
          body="Start a plan and let Switchboard handle the asking. One person or twenty — no group-chat chaos."
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
              <div className="space-y-2.5">
                {needsResponse.map(({ event }) => (
                  <EventCard key={event.id} event={event} note="Respond soon 💌" />
                ))}
              </div>
            </section>
          )}
          {(hosting?.length ?? 0) > 0 && (
            <section>
              <SectionHeader title="Hosting" />
              <div className="space-y-2.5">
                {(hosting as SwitchboardEvent[]).map((event) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
          {going.length > 0 && (
            <section>
              <SectionHeader title="Going" />
              <div className="space-y-2.5">
                {going.map(({ event }) => (
                  <EventCard key={event.id} event={event} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
