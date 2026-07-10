import type { Metadata } from 'next';
import { after } from 'next/server';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import { CascadeProgress } from '@/components/events/CascadeProgress';
import { JoinRequests } from '@/components/events/JoinRequests';
import { RsvpCard } from '@/components/events/RsvpCard';
import { Announcements, type AnnouncementView } from '@/components/events/Announcements';
import { RunItBackButton } from '@/components/events/RunItBackButton';
import { PollSection, type OptionResult } from '@/components/polls/PollSection';
import { HostControls } from './HostControls';
import { CoHostManager } from './CoHostManager';
import { AddInvitees } from './AddInvitees';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { formatDateTime } from '@/lib/format';
import { googleCalendarUrl } from '@/lib/calendar-links';
import type {
  EventQuestion,
  Invite,
  Poll,
  PollOption,
  SwitchboardEvent,
} from '@/lib/types';
import type { Weight } from '@/lib/engine/scoring';

/** Rich unfurl card for directly-shared event links (iMessage/WhatsApp/Slack). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  if (!hasAdminCredentials()) return {};
  const { id } = await params;
  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('title, description, starts_at, location_name')
    .eq('id', id)
    .maybeSingle();
  if (!event) return {};
  const when = event.starts_at ? formatDateTime(event.starts_at) : null;
  const description =
    event.description?.trim() ||
    [when, event.location_name].filter(Boolean).join(' · ') ||
    'A plan on Switchboard.';
  return {
    title: event.title,
    openGraph: {
      title: event.title,
      description,
      images: [`/api/og/event/${id}`],
    },
  };
}

export default async function EventPage({
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

  // Lazy cascade tick — the cron sweep is the backstop. Run it *after* the
  // response so a plain page view never blocks on write-side work or outbound
  // SMS (SB-07); the tick's effects show on the next load.
  after(async () => {
    try {
      await advanceEventCascade(id);
    } catch {
      // Advancement is best-effort.
    }
  });

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single<SwitchboardEvent>();
  if (!event) notFound();

  const isHost = event.host_id === user.id;
  const admin = createAdminClient();

  // Co-hosts share host powers. Read the list with admin — a co-host can't
  // see the full roster through their own RLS.
  const { data: cohostRows } = await admin
    .from('event_cohosts')
    .select('cohost_id')
    .eq('event_id', id);
  const cohostIds = (cohostRows ?? []).map((row) => row.cohost_id as string);
  const isCoHost = cohostIds.includes(user.id);
  const canManage = isHost || isCoHost;

  // Names for the primary host's co-host manager.
  let cohosts: Array<{ id: string; name: string }> = [];
  if (isHost && cohostIds.length > 0) {
    const { data } = await admin
      .from('profiles')
      .select('id, display_name')
      .in('id', cohostIds);
    cohosts = (data ?? []).map((p) => ({
      id: p.id as string,
      name: (p.display_name as string) ?? 'Co-host',
    }));
  }

  // Host/co-host: full cascade view. Invitee: their own invite.
  let hostInvites: Array<Invite & { invitee_name: string }> = [];
  let myInvite: Invite | null = null;

  if (canManage) {
    const { data } = await admin
      .from('invites')
      .select('*, invitee:profiles(display_name)')
      .eq('event_id', id)
      .order('position');
    hostInvites = (data ?? []).map((row) => {
      const profile = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
      return {
        ...(row as Invite),
        invitee_name: profile?.display_name ?? row.guest_name ?? 'Guest',
      };
    });
  } else {
    const { data } = await supabase
      .from('invites')
      .select('*')
      .eq('event_id', id)
      .eq('invitee_id', user.id)
      .maybeSingle<Invite>();
    myInvite = data;
  }

  // Host's own connections, for one-tap adding to the flow (only needed while
  // the Add-people panel is shown). Anyone already on the invite list is
  // filtered out so the picker only offers new people.
  const addableConnections: Array<{ id: string; name: string; handle: string }> = [];
  if (canManage && event.status === 'inviting') {
    const invitedIds = new Set(
      hostInvites
        .map((invite) => invite.invitee_id)
        .filter((invId): invId is string => Boolean(invId)),
    );
    const { data: connectionRows } = await supabase
      .from('connections')
      .select(
        'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name, handle), addressee:profiles!connections_addressee_id_fkey(id, display_name, handle)',
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    for (const row of connectionRows ?? []) {
      const isRequester = row.requester_id === user.id;
      const otherRaw = isRequester ? row.addressee : row.requester;
      const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
      if (!other || invitedIds.has(other.id)) continue;
      addableConnections.push({
        id: other.id,
        name: other.display_name ?? 'Friend',
        handle: other.handle ?? '',
      });
    }
  }

  // Accepted attendees (respects visibility settings; admin read + TS check).
  let attendees: Array<{ id: string; name: string }> = [];
  if (canManage || event.show_accepted) {
    const { data } = await admin
      .from('invites')
      .select('id, invitee_id, guest_name, invitee:profiles(display_name)')
      .eq('event_id', id)
      .eq('status', 'accepted');
    attendees = (data ?? []).map((row) => {
      const profile = Array.isArray(row.invitee) ? row.invitee[0] : row.invitee;
      return {
        id: row.invitee_id ?? row.id,
        name: profile?.display_name ?? row.guest_name ?? 'Guest',
      };
    });
  }

  // Poll (Anonymous Weighted Input)
  const { data: poll } = await supabase
    .from('polls')
    .select('*')
    .eq('event_id', id)
    .maybeSingle<Poll>();

  let options: PollOption[] = [];
  let results: OptionResult[] = [];
  let myVotes: Record<string, Weight> = {};
  if (poll) {
    const [{ data: optionRows }, { data: resultRows }, { data: voteRows }] =
      await Promise.all([
        supabase.from('poll_options').select('*').eq('poll_id', poll.id),
        supabase.rpc('poll_results', { p_poll: poll.id }),
        supabase
          .from('poll_votes')
          .select('option_id, weight')
          .eq('poll_id', poll.id)
          .eq('voter_id', user.id),
      ]);
    options = optionRows ?? [];
    results = (resultRows ?? []) as OptionResult[];
    myVotes = Object.fromEntries(
      (voteRows ?? []).map((v) => [v.option_id, v.weight as Weight]),
    );
  }

  // Venue perk when the location matches a claimed partner venue.
  let venuePerk: { name: string; perk: string } | null = null;
  if (event.location_name) {
    const { data: venue } = await supabase
      .from('venues')
      .select('name, perk')
      .ilike('name', event.location_name.trim())
      .limit(1)
      .maybeSingle();
    venuePerk = venue ?? null;
  }

  // RSVP questions (host-defined intake).
  const { data: questionRows } = await supabase
    .from('event_questions')
    .select('*')
    .eq('event_id', id)
    .order('position')
    .returns<EventQuestion[]>();
  const questions = questionRows ?? [];

  // Announcements (host broadcasts) with author names.
  const { data: announcementRows } = await supabase
    .from('announcements')
    .select('id, body, created_at, author:profiles(display_name)')
    .eq('event_id', id)
    .order('created_at', { ascending: false });
  const announcements: AnnouncementView[] = (announcementRows ?? []).map((row) => {
    const author = Array.isArray(row.author) ? row.author[0] : row.author;
    return {
      id: row.id as string,
      body: row.body as string,
      created_at: row.created_at as string,
      author_name: author?.display_name ?? 'Host',
    };
  });

  // True accepted count (independent of visibility) so the host knows the reach.
  const { count: acceptedCount } = await admin
    .from('invites')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', id)
    .eq('status', 'accepted');

  // Host-only: answers to RSVP questions, grouped by attendee.
  let answersByGuest: Array<{ name: string; answers: Array<{ prompt: string; answer: string }> }> = [];
  if (isHost && questions.length > 0) {
    const promptById = new Map(questions.map((q) => [q.id, q.prompt]));
    const { data: answerRows } = await admin
      .from('invite_answers')
      .select('question_id, answer, invite:invites(guest_name, invitee:profiles(display_name))')
      .in('question_id', Array.from(promptById.keys()));
    const grouped = new Map<string, Array<{ prompt: string; answer: string }>>();
    for (const row of answerRows ?? []) {
      const invite = Array.isArray(row.invite) ? row.invite[0] : row.invite;
      const profile = invite
        ? Array.isArray(invite.invitee)
          ? invite.invitee[0]
          : invite.invitee
        : null;
      const name = profile?.display_name ?? invite?.guest_name ?? 'Guest';
      const list = grouped.get(name) ?? [];
      list.push({
        prompt: promptById.get(row.question_id as string) ?? '',
        answer: row.answer as string,
      });
      grouped.set(name, list);
    }
    answersByGuest = Array.from(grouped.entries()).map(([name, answers]) => ({
      name,
      answers,
    }));
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const calendarEvent = event.starts_at
    ? {
        title: event.title,
        description: event.description,
        location: event.location_name,
        startsAt: event.starts_at,
        endsAt: event.ends_at,
      }
    : null;
  const guestLinks = canManage
    ? hostInvites
        .filter((i) => !i.invitee_id && i.guest_token && i.status === 'sent')
        .map((i) => ({
          name: i.invitee_name,
          url: `${appUrl}/rsvp/${i.guest_token}`,
        }))
    : [];

  const statusLabel: Record<SwitchboardEvent['status'], string> = {
    draft: 'Draft',
    deciding: '🗳️ Group is deciding',
    inviting: '🪜 Invitations in motion',
    confirmed: '✓ Confirmed',
    cancelled: 'Cancelled',
    past: 'Past',
  };

  // Stable hero color derived from the event id.
  const heroIndex = Array.from(event.id).reduce(
    (sum, ch) => sum + ch.charCodeAt(0),
    0,
  );

  // schema.org/Event JSON-LD so the link is machine-parseable (rich results,
  // and other tools can read the plan).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.starts_at ? { startDate: event.starts_at } : {}),
    ...(event.ends_at ? { endDate: event.ends_at } : {}),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.location_name
      ? {
          location: {
            '@type': 'Place',
            name: event.location_name,
            ...(event.location_address ? { address: event.location_address } : {}),
          },
        }
      : {}),
  };

  return (
    <AppShell title={event.title} back="/plans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="space-y-6">
        <div className="space-y-4">
          {event.cover_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={event.cover_url}
              alt=""
              className="w-full max-h-64 rounded-card object-cover shadow-lift"
            />
          )}
          <PlanCard
            variant="full"
            title={event.title}
            color={planColor(heroIndex)}
            status={statusLabel[event.status]}
            when={formatDateTime(event.starts_at)}
            where={event.location_name ?? undefined}
            attendees={attendees.map((attendee) => ({ name: attendee.name }))}
            attendeesLabel={
              attendees.length > 0
                ? `${attendees.length}${event.capacity ? ` of ${event.capacity}` : ''} going`
                : undefined
            }
          />
          {event.description && (
            <p className="text-ink-soft text-[15px] leading-relaxed">{event.description}</p>
          )}
          <div className="flex gap-2 flex-wrap">
            <a
              href={`/api/events/${event.id}/ics`}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
            >
              📅 Apple / Outlook
            </a>
            {calendarEvent && (
              <a
                href={googleCalendarUrl(calendarEvent)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                📅 Google Calendar
              </a>
            )}
            {event.wishlist_url && (
              <a
                href={event.wishlist_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                🎁 Wishlist
              </a>
            )}
            {event.room_id && (
              <Link
                href={`/rooms/${event.room_id}`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                ❋ Living Room
              </Link>
            )}
            {event.starts_at && new Date(event.starts_at) < new Date() && (
              <Link
                href={`/events/${event.id}/capsule`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                📦 Memory Capsule
              </Link>
            )}
            {isHost && (
              <a
                href={`/api/events/${event.id}/guests.csv`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
              >
                ⬇ Guest list (CSV)
              </a>
            )}
            {canManage &&
              event.status !== 'cancelled' &&
              event.status !== 'past' && (
                <Link
                  href={`/events/${event.id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-xs font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
                >
                  ✏️ Edit plan
                </Link>
              )}
            <ShareButton
              path={`/events/${event.id}`}
              title={event.title}
              text={`${event.title} on Switchboard`}
            />
          </div>
          {venuePerk && (
            <p className="rounded-card bg-gold-soft px-3.5 py-3 text-sm">
              🏪 <strong className="font-bold">{venuePerk.name}</strong> perk for Switchboard groups:{' '}
              {venuePerk.perk}
            </p>
          )}
        </div>

        {/* Invitee RSVP */}
        {myInvite?.status === 'sent' && (
          <RsvpCard
            inviteId={myInvite.id}
            questions={questions.map((q) => ({
              id: q.id,
              prompt: q.prompt,
              required: q.required,
            }))}
            expiresAtIso={
              inviteExpiresAt({
                id: myInvite.id,
                position: myInvite.position,
                groupStage: myInvite.group_stage,
                status: myInvite.status,
                windowMinutes: myInvite.window_minutes,
                sentAt: myInvite.sent_at,
              })?.toISOString() ?? null
            }
          />
        )}
        {myInvite?.status === 'accepted' && (
          <Card tone="sage" lifted>
            <p className="font-extrabold text-lg text-sage-deep">You’re in ✓</p>
            <p className="text-sm text-ink-soft mt-0.5">
              See you there. The Living Room has the details.
            </p>
          </Card>
        )}
        {myInvite?.status === 'waitlisted' && (
          <Card tone="gold" lifted>
            <p className="font-extrabold text-lg">You’re on the waitlist</p>
            <p className="text-sm text-ink-soft mt-0.5">
              If a spot opens up, you’ll be the first to know.
            </p>
          </Card>
        )}

        {/* Poll */}
        {poll && (
          <PollSection
            poll={poll}
            options={options}
            results={results}
            myVotes={myVotes}
            isHost={isHost}
            eventId={event.id}
          />
        )}

        {/* Host broadcasts */}
        <Announcements
          eventId={event.id}
          isHost={isHost}
          canReach={acceptedCount ?? 0}
          announcements={announcements}
        />

        {/* Host-only: RSVP question answers */}
        {isHost && answersByGuest.length > 0 && (
          <section>
            <SectionHeader title="RSVP answers" hint="Only you can see these" />
            <ul className="space-y-2">
              {answersByGuest.map((guest) => (
                <li key={guest.name} className="rounded-card bg-cream px-3.5 py-3">
                  <p className="text-sm font-bold text-ink">{guest.name}</p>
                  <dl className="mt-1.5 space-y-1">
                    {guest.answers.map((qa, i) => (
                      <div key={i} className="text-sm">
                        <dt className="text-ink-faint">{qa.prompt}</dt>
                        <dd className="text-ink font-medium">{qa.answer}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Attendees */}
        {attendees.length > 0 && (
          <section>
            <SectionHeader
              title="Who’s in"
              hint={`${attendees.length}${event.capacity ? ` of ${event.capacity}` : ''} so far`}
            />
            <div className="flex flex-wrap gap-3">
              {attendees.map((attendee) => (
                <div key={attendee.id} className="flex flex-col items-center gap-1 w-16">
                  <Avatar name={attendee.name} seed={attendee.id} size="md" ring />
                  <span className="text-xs font-semibold text-ink-soft truncate w-full text-center">
                    {attendee.name.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Open Table join requests */}
        {canManage && (
          <JoinRequests
            eventId={event.id}
            requests={hostInvites
              .filter((invite) => invite.status === 'requested')
              .map((invite) => ({
                inviteId: invite.id,
                name: invite.invitee_name,
                userId: invite.invitee_id ?? invite.id,
              }))}
          />
        )}

        {/* Host cascade view */}
        {canManage && hostInvites.length > 0 && event.status !== 'deciding' && (
          <section>
            <SectionHeader
              title="Invitation flow"
              hint="Live view - only you can see this"
            />
            <CascadeProgress
              invites={hostInvites.filter((invite) => invite.status !== 'requested')}
              mode={event.invite_mode}
              eventId={event.id}
              editable={canManage && event.status === 'inviting'}
            />
          </section>
        )}

        {/* Guest links for the host to share */}
        {guestLinks.length > 0 && (
          <section>
            <SectionHeader title="Guest links" hint="Send these to your guests - no account needed" />
            <ul className="space-y-2">
              {guestLinks.map((guest) => (
                <li key={guest.url} className="flex items-center justify-between gap-2 rounded-card bg-cream px-3.5 py-3">
                  <span className="text-sm font-bold">{guest.name}</span>
                  <CopyButton text={guest.url} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {canManage && event.status === 'inviting' && (
          <AddInvitees eventId={event.id} connections={addableConnections} />
        )}

        {canManage && <HostControls event={event} pollDecided={poll?.phase === 'decided'} />}

        {isHost && <CoHostManager eventId={event.id} cohosts={cohosts} />}

        {/* Run it back: available to the host once the plan is behind them. */}
        {isHost &&
          (event.status === 'past' ||
            event.status === 'cancelled' ||
            (event.starts_at && new Date(event.starts_at) < new Date())) && (
            <section className="border-t border-line pt-6">
              <p className="text-sm text-ink-soft mb-2.5">
                Loved it? Gather the same crew for a fresh plan.
              </p>
              <RunItBackButton eventId={event.id} />
            </section>
          )}
      </div>
    </AppShell>
  );
}
