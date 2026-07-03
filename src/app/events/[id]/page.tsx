import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { CopyButton } from '@/components/ui/CopyButton';
import { CascadeProgress } from '@/components/events/CascadeProgress';
import { RsvpCard } from '@/components/events/RsvpCard';
import { PollSection, type OptionResult } from '@/components/polls/PollSection';
import { HostControls } from './HostControls';
import { inviteExpiresAt } from '@/lib/engine/cascade';
import { formatDateTime } from '@/lib/format';
import type { Invite, Poll, PollOption, SwitchboardEvent } from '@/lib/types';
import type { Weight } from '@/lib/engine/scoring';

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

  // Lazy cascade tick — the cron sweep is the backstop, this keeps pages live.
  try {
    await advanceEventCascade(id);
  } catch {
    // Advancement is best-effort on page load.
  }

  const { data: event } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single<SwitchboardEvent>();
  if (!event) notFound();

  const isHost = event.host_id === user.id;
  const admin = createAdminClient();

  // Host: full cascade view. Invitee: their own invite.
  let hostInvites: Array<Invite & { invitee_name: string }> = [];
  let myInvite: Invite | null = null;

  if (isHost) {
    const { data } = await supabase
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

  // Accepted attendees (respects visibility settings; admin read + TS check).
  let attendees: Array<{ id: string; name: string }> = [];
  if (isHost || event.show_accepted) {
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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const guestLinks = isHost
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

  return (
    <AppShell title={event.title} back="/plans">
      <div className="space-y-6">
        <div>
          <span
            className={`inline-block rounded-pill px-3 py-1 text-xs font-medium ${
              event.status === 'confirmed'
                ? 'bg-sage-soft text-sage-deep'
                : event.status === 'cancelled'
                  ? 'bg-rose-soft text-rose-deep'
                  : 'bg-gold-soft text-ink-soft'
            }`}
          >
            {statusLabel[event.status]}
          </span>
          <p className="mt-3 text-ink font-medium">{formatDateTime(event.starts_at)}</p>
          {event.location_name && (
            <p className="text-ink-soft text-sm mt-0.5">📍 {event.location_name}</p>
          )}
          {event.description && (
            <p className="text-ink-soft text-sm mt-2 leading-relaxed">{event.description}</p>
          )}
          <div className="flex gap-2 mt-3 flex-wrap">
            <a
              href={`/api/events/${event.id}/ics`}
              className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors"
            >
              📅 Add to calendar
            </a>
            {event.room_id && (
              <Link
                href={`/rooms/${event.room_id}`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink-soft hover:border-terracotta hover:text-terracotta-deep transition-colors"
              >
                ❋ Living Room
              </Link>
            )}
          </div>
        </div>

        {/* Invitee RSVP */}
        {myInvite?.status === 'sent' && (
          <RsvpCard
            inviteId={myInvite.id}
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
          <Card tone="sage">
            <p className="font-medium text-sage-deep">You’re in ✓</p>
            <p className="text-sm text-ink-soft mt-0.5">
              See you there. The Living Room has the details.
            </p>
          </Card>
        )}
        {myInvite?.status === 'waitlisted' && (
          <Card tone="gold">
            <p className="font-medium">You’re on the waitlist</p>
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
                  <Avatar name={attendee.name} seed={attendee.id} size="md" />
                  <span className="text-xs text-ink-soft truncate w-full text-center">
                    {attendee.name.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Host cascade view */}
        {isHost && hostInvites.length > 0 && event.status !== 'deciding' && (
          <section>
            <SectionHeader
              title="Invitation flow"
              hint="Live view — only you can see this"
            />
            <CascadeProgress invites={hostInvites} mode={event.invite_mode} />
          </section>
        )}

        {/* Guest links for the host to share */}
        {guestLinks.length > 0 && (
          <section>
            <SectionHeader title="Guest links" hint="Send these to your guests — no account needed" />
            <ul className="space-y-2">
              {guestLinks.map((guest) => (
                <li key={guest.url} className="flex items-center justify-between gap-2 rounded-card bg-cream px-3.5 py-2.5">
                  <span className="text-sm font-medium">{guest.name}</span>
                  <CopyButton text={guest.url} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {isHost && <HostControls event={event} pollDecided={poll?.phase === 'decided'} />}
      </div>
    </AppShell>
  );
}
