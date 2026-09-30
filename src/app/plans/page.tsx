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
import { LISTED_INVITE_STATUSES, sortPlans } from './sections';

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

  // Your hosted plans, the plans you co-host, plus the invites you hold. The
  // invites are read as plain rows — NOT a PostgREST-embedded `invites →
  // events` join. That embed only resolves when the invites→events foreign key
  // is present in the database serving the request, so a deployment with
  // FK/schema drift makes the whole calendar query fail. When that error is
  // swallowed (as it was here) the calendar never surfaces the failure and
  // hangs on its loading skeleton. The invited and co-hosted plans are instead
  // resolved by primary key, which is immune to FK metadata (mirroring the
  // guest-RSVP fix in #44), and query errors are surfaced to the error boundary
  // rather than discarded.
  const [
    { data: hosting, error: hostingError },
    { data: inviteRows, error: invitesError },
    { data: cohostRows, error: cohostError },
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
      // `queued` is included for one reason: a plan still deciding its date
      // shows its whole invited group the poll before any invite is sent, and
      // those people were the only ones whose plan had no card here.
      .in('status', [...LISTED_INVITE_STATUSES]),
    // A co-host's own membership row (`event_cohosts_self_select`). Co-hosted
    // plans used to be missing from here entirely unless the co-host also
    // happened to hold an invitation.
    supabase
      .from('event_cohosts')
      .select('event_id')
      .eq('cohost_id', user.id),
  ]);

  if (hostingError || invitesError || cohostError) {
    await reportOperationalError('plans.load', hostingError ?? invitesError ?? cohostError, {
      userId: user.id,
    });
    throw new Error('Could not load your calendar');
  }

  // Resolve the invited and co-hosted plans by primary key. RLS still applies
  // (co-hosts may read the plans they co-host), so any event the viewer may
  // not see simply won't come back and is dropped below.
  const cohostIds = new Set((cohostRows ?? []).map((row) => row.event_id as string));
  const eventIds = [
    ...new Set([
      ...(inviteRows ?? [])
        .map((row) => row.event_id)
        .filter((id): id is string => Boolean(id)),
      ...cohostIds,
    ]),
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

  const sections = sortPlans({
    userId: user.id,
    hosted: hosting ?? [],
    cohosted: [...cohostIds]
      .map((id) => eventsById.get(id))
      .filter((event): event is SwitchboardEvent => Boolean(event)),
    invited: (inviteRows ?? []).flatMap((row) => {
      const event = eventsById.get(row.event_id);
      return event ? [{ status: row.status, event }] : [];
    }),
    nowMs: new Date().getTime(),
  });
  const {
    needsResponse,
    deciding,
    awaitingGuardian,
    hosting: hostingUpcoming,
    going,
    waitlisted,
    requested,
    past: pastEvents,
  } = sections;

  const isEmpty = Object.values(sections).every((list) => list.length === 0);

  return (
    <AppShell title="Coming up">
      {isEmpty ? (
        <EmptyState
          emoji="✦"
          title="Nothing on the calendar"
          body="Start a plan and let Switchboard handle the asking. One person or twenty - no group-chat chaos."
          action={
            <Link href="/create">
              <Button>Start something</Button>
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
          {deciding.length > 0 && (
            <section>
              <SectionHeader
                title="Help pick a date"
                hint="The group decides before invitations go out"
              />
              <div className="grid grid-cols-2 gap-3">
                {deciding.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Vote" />
                ))}
              </div>
            </section>
          )}
          {awaitingGuardian.length > 0 && (
            <section>
              <SectionHeader
                title="Waiting on a guardian"
                hint="Your yes counts once a parent or guardian approves it"
              />
              <div className="grid grid-cols-2 gap-3">
                {awaitingGuardian.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Needs approval" />
                ))}
              </div>
            </section>
          )}
          {hostingUpcoming.length > 0 && (
            <section>
              <SectionHeader title="Hosting" />
              <div className="grid grid-cols-2 gap-3">
                {hostingUpcoming.map(({ event, cohost }, i) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    index={i}
                    note={cohost ? 'Co-hosting' : undefined}
                  />
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
          {waitlisted.length > 0 && (
            <section>
              <SectionHeader
                title="On the waitlist"
                hint="Full for now - if a spot opens, you’ll hear first"
              />
              <div className="grid grid-cols-2 gap-3">
                {waitlisted.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Waitlisted" />
                ))}
              </div>
            </section>
          )}
          {requested.length > 0 && (
            <section>
              <SectionHeader
                title="Asked to join"
                hint="Open Table requests the host hasn’t answered yet"
              />
              <div className="grid grid-cols-2 gap-3">
                {requested.map(({ event }, i) => (
                  <EventCard key={event.id} event={event} index={i} note="Asked" />
                ))}
              </div>
            </section>
          )}
          {pastEvents.length > 0 && (
            <section>
              <SectionHeader title="Past plans" hint="Plans that have wrapped" />
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
