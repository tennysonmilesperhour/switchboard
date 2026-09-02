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
import { reportOperationalError } from '@/lib/server/observability';
import type { SwitchboardEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Calendar' };

const STATUS_LABELS: Record<string, string> = {
  deciding: 'Deciding',
  inviting: 'Inviting',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  past: 'Past',
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
      variant="tile"
      href={`/events/${event.id}`}
      title={event.title}
      color={planColor(index)}
      imageUrl={event.cover_url}
      when={formatDateTime(event.starts_at, event.time_zone)}
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

  // Your hosted plans, plus the invites you hold. The invites are read as plain
  // rows — NOT a PostgREST-embedded `invites → events` join. That embed only
  // resolves when the invites→events foreign key is present in the database
  // serving the request, so a deployment with FK/schema drift makes the whole
  // calendar query fail. When that error is swallowed (as it was here) the
  // calendar never surfaces the failure and hangs on its loading skeleton. The
  // invited plans are instead resolved by primary key, which is immune to FK
  // metadata (mirroring the guest-RSVP fix in #44), and query errors are
  // surfaced to the error boundary rather than discarded.
  const [
    { data: hosting, error: hostingError },
    { data: inviteRows, error: invitesError },
  ] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('host_id', user.id)
      // Everything except cancelled. Plans that have already happened are kept
      // and surfaced in their own "Past events" section below rather than hidden.
      .neq('status', 'cancelled')
      .order('starts_at', { ascending: true, nullsFirst: false }),
    supabase
      .from('invites')
      .select('status, event_id')
      .eq('invitee_id', user.id)
      .in('status', ['sent', 'accepted', 'waitlisted']),
  ]);

  if (hostingError || invitesError) {
    await reportOperationalError('plans.load', hostingError ?? invitesError, {
      userId: user.id,
    });
    throw new Error('Could not load your calendar');
  }

  // Resolve the invited plans by primary key. RLS still applies, so any event
  // the viewer may not see simply won't come back and is dropped below.
  const eventIds = [
    ...new Set(
      (inviteRows ?? [])
        .map((row) => row.event_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const eventsById = new Map<string, SwitchboardEvent>();
  if (eventIds.length > 0) {
    const { data: invitedEvents, error: invitedEventsError } = await supabase
      .from('events')
      .select('*')
      .in('id', eventIds);
    if (invitedEventsError) {
      await reportOperationalError('plans.invited-events', invitedEventsError, {
        userId: user.id,
      });
      throw new Error('Could not load your calendar');
    }
    for (const event of invitedEvents ?? []) {
      eventsById.set(event.id, event);
    }
  }

  const invited = (inviteRows ?? [])
    .map((row) => ({
      status: row.status,
      event: eventsById.get(row.event_id) ?? null,
    }))
    .filter(
      (row): row is { status: string; event: SwitchboardEvent } =>
        row.event !== null &&
        row.event.host_id !== user.id &&
        row.event.status !== 'cancelled',
    );

  // "Already happened" is judged by the actual start time (with the 'past'
  // status as a fallback) so a plan drops into the archive as soon as it is
  // over — even before the status-sweeping cron catches up. Plans with no set
  // date (Time TBD) are treated as upcoming.
  const nowMs = new Date().getTime();
  const hasHappened = (event: SwitchboardEvent) =>
    event.status === 'past' ||
    (event.starts_at !== null && new Date(event.starts_at).getTime() < nowMs);

  const hostingAll = hosting ?? [];
  const hostingUpcoming = hostingAll.filter((event) => !hasHappened(event));

  const upcomingInvited = invited.filter((row) => !hasHappened(row.event));
  const needsResponse = upcomingInvited.filter((i) => i.status === 'sent');
  const going = upcomingInvited.filter((i) => i.status !== 'sent');

  // Past plans you hosted or committed to, newest first. Invitations you never
  // answered for events that have since passed are dropped rather than archived.
  const pastEvents = [
    ...hostingAll.filter(hasHappened),
    ...invited
      .filter((row) => row.status !== 'sent' && hasHappened(row.event))
      .map((row) => row.event),
  ].sort((a, b) => {
    const ta = a.starts_at ? new Date(a.starts_at).getTime() : 0;
    const tb = b.starts_at ? new Date(b.starts_at).getTime() : 0;
    return tb - ta;
  });

  const isEmpty =
    hostingUpcoming.length === 0 &&
    needsResponse.length === 0 &&
    going.length === 0 &&
    pastEvents.length === 0;

  return (
    <AppShell title="Coming up">
      {isEmpty ? (
        <EmptyState
          emoji="✦"
          title="Nothing on the calendar"
          body="Start a plan and let Switchboard handle the asking. One person or twenty - no group-chat chaos."
          action={
            <Link href="/create">
              <Button>Make a plan</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-7">
          {needsResponse.length > 0 && (
            <section>
              <SectionHeader title="Waiting on you" hint="These invitations have a timer" />
              <div className="grid grid-cols-2 gap-3">
                {needsResponse.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Respond soon" />
                ))}
              </div>
            </section>
          )}
          {hostingUpcoming.length > 0 && (
            <section>
              <SectionHeader title="Hosting" />
              <div className="grid grid-cols-2 gap-3">
                {hostingUpcoming.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            </section>
          )}
          {going.length > 0 && (
            <section>
              <SectionHeader title="Going" />
              <div className="grid grid-cols-2 gap-3">
                {going.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} />
                ))}
              </div>
            </section>
          )}
          {pastEvents.length > 0 && (
            <section>
              <SectionHeader title="Past events" hint="Plans that have wrapped" />
              <div className="grid grid-cols-2 gap-3">
                {pastEvents.map((event, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Past" />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
