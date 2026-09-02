import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getRenderUser } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { SignalBar } from '@/components/signals/SignalBar';
import { GettingStarted } from '@/components/home/GettingStarted';
import { Greeting } from '@/components/home/Greeting';
import { PillarRow } from '@/components/home/PillarRow';
import { PassportCard } from '@/components/home/PassportCard';
import { RecentMatches } from '@/components/home/RecentMatches';
import { loadPassport } from '@/lib/server/passport';
import { loadFindability } from '@/lib/server/findability';
import { findabilitySettled } from '@/lib/findability';
import { passportProgress } from '@/lib/passport';
import {
  EnergyPrompt,
  MatchmakerCard,
  RitualCard,
  type ProposalCardData,
  type RitualCardData,
} from '@/components/home/HomeCards';
import { getReconnectionSuggestions } from '@/lib/server/radar';
import { formatDateTime, formatRelative } from '@/lib/format';
import { greetingFor } from '@/lib/greeting';

export default async function HomePage() {
  const supabase = await createClient();
  const user = await getRenderUser();
  if (!user) redirect('/welcome');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarded, timezone')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarded) redirect('/onboarding');

  const nowIso = new Date().toISOString();
  const [
    { data: mySignals },
    { data: circles },
    { data: friendSignals },
    { data: pendingInvites },
    { data: upcoming },
    { data: recentMatches },
    { count: friendCount },
  ] = await Promise.all([
    supabase
      .from('availability_signals')
      .select('emoji, label, expires_at, circle_ids')
      .eq('user_id', user.id)
      .gt('expires_at', nowIso)
      .order('created_at'),
    supabase.from('circles').select('id, name, emoji').eq('owner_id', user.id),
    supabase
      .from('availability_signals')
      .select('id, emoji, label, expires_at, user_id, profile:profiles(display_name, handle)')
      .neq('user_id', user.id)
      .gt('expires_at', nowIso)
      .limit(12),
    supabase
      .from('invites')
      .select('id, event:events(id, title, starts_at, time_zone)')
      .eq('invitee_id', user.id)
      .eq('status', 'sent'),
    supabase
      .from('events')
      .select('*')
      .in('status', ['confirmed', 'inviting', 'deciding'])
      .gte('starts_at', nowIso)
      .order('starts_at')
      .limit(4),
    // Via the function rather than the table: it drops the ones this person
    // has cleared *before* taking three, so clearing a card promotes the next
    // match up instead of just leaving a shorter list.
    supabase.rpc('my_recent_matches', { p_limit: 3 }),
    supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
  ]);

  // Innovations: matchmaker proposals, rituals, radar, energy prompts.
  const nowMs = new Date(nowIso).getTime();
  const threeDaysAgo = new Date(nowMs - 3 * 86_400_000).toISOString();
  const [
    { data: proposalRows },
    { data: ritualRows },
    radar,
    { data: recentPast },
    { data: energyLogged },
  ] = await Promise.all([
    supabase.rpc('my_matchmaker_proposals'),
    supabase
      .from('rituals')
      .select(
        'id, activity, cadence_days, status, last_planned_at, creator_id, partner_id, creator:profiles!rituals_creator_id_fkey(display_name), partner:profiles!rituals_partner_id_fkey(display_name)',
      )
      .or(`creator_id.eq.${user.id},partner_id.eq.${user.id}`)
      .in('status', ['proposed', 'active']),
    getReconnectionSuggestions(user.id),
    supabase
      .from('events')
      .select('id, title, starts_at')
      .lt('starts_at', nowIso)
      .gte('starts_at', threeDaysAgo)
      .neq('status', 'cancelled')
      .limit(3),
    supabase.from('energy_logs').select('event_id').eq('user_id', user.id),
  ]);

  const proposals: ProposalCardData[] = (proposalRows ?? []).map(
    (row: {
      id: string;
      activity: string;
      note: string | null;
      proposer_name: string;
      my_response: string;
      status: string;
      room_id: string | null;
      other_name: string | null;
    }) => ({
      id: row.id,
      activity: row.activity,
      note: row.note,
      proposerName: row.proposer_name,
      myResponse: row.my_response,
      status: row.status,
      roomId: row.room_id,
      otherName: row.other_name,
    }),
  );

  const rituals: RitualCardData[] = (ritualRows ?? [])
    .map((row) => {
      const isMine = row.creator_id === user.id;
      const otherRaw = isMine ? row.partner : row.creator;
      const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
      const due =
        row.status === 'active' &&
        (!row.last_planned_at ||
          nowMs - new Date(row.last_planned_at).getTime() >
            row.cadence_days * 86_400_000);
      return {
        id: row.id,
        activity: row.activity,
        otherName: other?.display_name ?? 'Friend',
        otherId: isMine ? row.partner_id : row.creator_id,
        cadenceDays: row.cadence_days,
        status: row.status,
        isMine,
        due,
      };
    })
    .filter((ritual) => (ritual.status === 'proposed' && !ritual.isMine) || ritual.due);

  const loggedIds = new Set((energyLogged ?? []).map((log) => log.event_id));
  const energyPrompts = (recentPast ?? []).filter((event) => !loggedIds.has(event.id));

  // The getting-started card owns the first run; the passport only appears
  // after its steps are behind you, so a new user is never shown two progress
  // cards at once.
  const findableDone = findabilitySettled(await loadFindability());
  const gettingStartedDone =
    (friendCount ?? 0) > 0 &&
    (upcoming?.length ?? 0) > 0 &&
    (mySignals?.length ?? 0) > 0 &&
    findableDone;
  const passportSummary = gettingStartedDone
    ? passportProgress(await loadPassport(user.id))
    : { earned: 0, total: 0, done: false, next: null };

  const firstName = profile.display_name.split(' ')[0];
  // Timed by the reader's clock, never the server's — `new Date().getHours()`
  // here reads UTC on Vercel and told a 9am Pacific tester "Good afternoon".
  // The stored zone renders first; <Greeting> corrects it from the browser.
  const greeting = greetingFor(new Date(), profile.timezone);

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <Greeting name={firstName} initial={greeting} />
          <p className="text-sm text-ink-faint mt-1">
            Feeling social? Let people know.
          </p>
        </div>

        {/* The four pillars, equal weight, above anything conditional. */}
        <PillarRow />

        <div id="signals" className="scroll-mt-20">
          <SignalBar active={mySignals ?? []} circles={circles ?? []} />
        </div>

        {/* The single first-run guidance card — checks itself off live. Once
            it retires, the passport takes over as the quiet way to find the
            parts of the app you haven't met. Never both at once. */}
        {gettingStartedDone ? (
          <PassportCard
            earned={passportSummary.earned}
            total={passportSummary.total}
            nextLabel={passportSummary.next?.label ?? null}
          />
        ) : (
          <GettingStarted
            friendDone={(friendCount ?? 0) > 0}
            planDone={(upcoming?.length ?? 0) > 0}
            signalDone={(mySignals?.length ?? 0) > 0}
            findableDone={findableDone}
          />
        )}

        {/* Plan feed - the heart of Home */}
        {(upcoming?.length ?? 0) > 0 ? (
          <section aria-label="Your plans" className="space-y-4">
            {upcoming?.map((event, i) => (
              <PlanCard
                key={event.id}
                href={`/events/${event.id}`}
                title={event.title}
                color={planColor(i)}
                when={formatDateTime(event.starts_at, event.time_zone)}
                where={event.location_name ?? undefined}
                status={event.status === 'confirmed' ? 'Confirmed' : undefined}
                className="animate-card-in"
              />
            ))}
          </section>
        ) : (
          <div className="space-y-3">
            <Link href="/events/new" className="block">
              <PlanCard
                title="Float an idea to your people"
                color="pink"
                attendeesLabel="Pick something below, or start from scratch. Switchboard sorts out the details."
                actions={
                  <span className="rounded-btn bg-white/25 px-5 py-2.5 text-sm font-bold backdrop-blur-sm">
                    Create a plan
                  </span>
                }
              />
            </Link>
            <div className="flex flex-wrap gap-2" aria-label="Quick plan ideas">
              {['Coffee', 'Dinner', 'Game night', 'A walk', 'Drinks', 'Movie night'].map(
                (idea) => (
                  <Link
                    key={idea}
                    href={`/events/new?title=${encodeURIComponent(idea)}`}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3.5 py-2 text-sm font-bold text-ink-soft shadow-lift hover:border-terracotta hover:text-terracotta-deep active:scale-[0.98] transition-all"
                  >
                    {idea}
                  </Link>
                ),
              )}
            </div>
            <p className="text-xs text-ink-faint leading-relaxed">
              Nothing is revealed unless both sides choose it, and nothing nags.
              Invitations flow one person at a time.
            </p>
          </div>
        )}

        {/* Matchmaker introductions */}
        {proposals.length > 0 && (
          <section aria-label="Introductions">
            <div className="space-y-2.5">
              {proposals.map((proposal) => (
                <MatchmakerCard key={proposal.id} proposal={proposal} />
              ))}
            </div>
          </section>
        )}

        {/* Ritual nudges and invitations */}
        {rituals.length > 0 && (
          <section aria-label="Rituals">
            <div className="space-y-2.5">
              {rituals.map((ritual) => (
                <RitualCard key={ritual.id} ritual={ritual} />
              ))}
            </div>
          </section>
        )}

        {/* Reconnection radar (private) */}
        {radar.length > 0 && (
          <section>
            <SectionHeader
              title="It’s been a while"
              hint="Only you can see this"
            />
            <div className="space-y-2">
              {radar.map((suggestion) => (
                <Link
                  key={suggestion.friendId}
                  href={`/mutual?person=${suggestion.friendId}`}
                  className="block group"
                >
                  <Card className="group-hover:border-terracotta transition-colors">
                    <div className="flex items-center gap-3">
                      <Avatar
                        name={suggestion.friendName}
                        seed={suggestion.friendId}
                        size="sm"
                      />
                      <p className="text-sm flex-1">
                        <strong>{suggestion.friendName}</strong>{' '}
                        <span className="text-ink-soft">
                          {suggestion.daysSince
                            ? `· ${suggestion.daysSince} days since you got together`
                            : '· you two haven’t gotten together yet'}
                        </span>
                      </p>
                      <span className="text-xs text-terracotta-deep whitespace-nowrap">
                        Reach out quietly
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Post-event reflection */}
        {energyPrompts.length > 0 && (
          <section aria-label="Reflections">
            <div className="space-y-2.5">
              {energyPrompts.map((event) => (
                <EnergyPrompt
                  key={event.id}
                  eventId={event.id}
                  eventTitle={event.title}
                />
              ))}
            </div>
          </section>
        )}

        {/* Friends who are around */}
        {(friendSignals?.length ?? 0) > 0 && (
          <section>
            <SectionHeader
              title="Around right now"
              hint="Friends open to connecting"
            />
            <div className="space-y-2">
              {(friendSignals ?? []).map((signal) => {
                const profileRow = Array.isArray(signal.profile)
                  ? signal.profile[0]
                  : signal.profile;
                const name = profileRow?.display_name ?? 'Friend';
                const handle = profileRow?.handle;
                const href = handle ? `/u/${handle}?from=/` : '/mutual';
                return (
                  <Link key={signal.id} href={href} className="block group">
                    <Card tone="sage" className="group-hover:shadow-lift transition-shadow">
                      <div className="flex items-center gap-3">
                        <Avatar name={name} seed={signal.user_id} size="sm" />
                        <span className="flex-1 text-sm">
                          <strong>{name}</strong>{' '}
                          <span className="text-ink-soft">
                            is {signal.emoji} {signal.label}
                          </span>
                        </span>
                        <span className="text-xs text-ink-faint">
                          {formatRelative(signal.expires_at).replace('in ', '')} left
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Invitations waiting */}
        {(pendingInvites?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="Waiting on you 💌" />
            <div className="space-y-2">
              {(pendingInvites ?? []).map((invite) => {
                const event = Array.isArray(invite.event) ? invite.event[0] : invite.event;
                if (!event) return null;
                return (
                  <Link key={invite.id} href={`/events/${event.id}`} className="block group">
                    <Card tone="gold" className="group-hover:shadow-lift transition-shadow">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {formatDateTime(event.starts_at, event.time_zone)} · respond soon
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Fresh matches — each one clearable, by swipe or by button. */}
        <RecentMatches matches={recentMatches ?? []} />

        {/* Quick actions */}
        <section>
          <SectionHeader title="Make something happen" />
          <div className="space-y-3">
            <Link href="/people" className="group block">
              <Card
                tone="cream"
                className="group-hover:border-terracotta group-hover:shadow-lift transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden>👋</span>
                  <span className="flex-1">
                    <span className="block font-medium">Find &amp; add friends</span>
                    <span className="block text-xs text-ink-faint mt-0.5">
                      By handle, email, phone, or contacts
                    </span>
                  </span>
                  <Icon name="back" size={18} className="rotate-180 text-ink-faint" />
                </div>
              </Card>
            </Link>
            {/* The four pillars moved to the top of the page as an
                equal-weight row; what remains here are the two surfaces that
                answer "I don't know who or what yet". */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { href: '/discover', emoji: '🧭', title: 'Discover', body: 'What should we do?' },
                { href: '/moments', emoji: '✨', title: 'Moments', body: 'Who’s nearby' },
              ].map((action) => (
                <Link key={action.href} href={action.href} className="group">
                  <Card className="h-full group-hover:border-terracotta group-hover:shadow-lift transition-all">
                    <span className="text-2xl" aria-hidden>{action.emoji}</span>
                    <p className="font-medium mt-2">{action.title}</p>
                    <p className="text-xs text-ink-faint mt-0.5">{action.body}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
