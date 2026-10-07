import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient, getRenderUser } from '@/lib/supabase/server';
import { homePlans, pendingInvitesInOrder } from '@/lib/home-focus';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { PlanCard, planColor } from '@/components/ui/PlanCard';
import { SignalBar } from '@/components/signals/SignalBar';
import { Glyph } from '@/components/ui/Glyph';
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
import { resolveDefaultSignalCircle } from '@/lib/signal-audience';
import { localDate, ritualIsDue } from '@/lib/rituals';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { errorFor, type ErrorCode } from '@/lib/errors';
import { reportOperationalError } from '@/lib/server/observability';

/**
 * Every Home section that reads something on its own, with the code it shows
 * when that read fails. Each section fails alone: one broken card says so
 * where it would have been, and the rest of Home renders as normal. Before
 * this, about seventeen reads ignored their errors, so a failure looked
 * exactly like "nothing here" — no invitations, no plans, nobody around.
 */
const HOME_SECTIONS = {
  profile: { area: 'home.profile', code: 'SB-PROFILE-LOAD' },
  invites: { area: 'home.invites', code: 'SB-INVITE-LOAD' },
  plans: { area: 'home.plans', code: 'SB-PLAN-LOAD' },
  signals: { area: 'home.signals', code: 'SB-SIGNAL-LOAD' },
  around: { area: 'home.around', code: 'SB-AROUND-LOAD' },
  matches: { area: 'home.matches', code: 'SB-MATCH-LOAD' },
  connections: { area: 'home.connections', code: 'SB-CONNECTION-LOAD' },
  introductions: { area: 'home.introductions', code: 'SB-INTRO-LOAD' },
  rituals: { area: 'home.rituals', code: 'SB-RITUAL-LOAD' },
  radar: { area: 'home.radar', code: 'SB-RADAR-LOAD' },
  reflections: { area: 'home.reflections', code: 'SB-ENERGY-LOAD' },
} as const satisfies Record<string, { area: string; code: ErrorCode }>;

type HomeSection = keyof typeof HOME_SECTIONS;

/** A section whose read failed, in the place it would have rendered. */
function SectionError({ section }: { section: HomeSection }) {
  const entry = errorFor(HOME_SECTIONS[section].code);
  return (
    <Card>
      <div role="alert">
        <ErrorNotice message={entry.message} fix={entry.fix} code={entry.code} />
      </div>
    </Card>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const user = await getRenderUser();
  if (!user) redirect('/welcome');

  const userId = user.id;
  const failed = new Set<HomeSection>();
  const reads: Promise<void>[] = [];
  /** Note a failed read against its section and log it under that code. */
  function check(section: HomeSection, read: string, error: unknown) {
    if (!error) return;
    failed.add(section);
    reads.push(
      reportOperationalError(
        HOME_SECTIONS[section].area,
        error,
        { userId, read },
        HOME_SECTIONS[section].code,
      ),
    );
  }

  // maybeSingle: a missing row is an account that has not onboarded, and goes
  // there. A failed read is not — sending an onboarded person to onboarding
  // because a query errored would put their saved name and handle up for
  // overwriting. The proxy already enforces the onboarding funnel.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('display_name, onboarded, timezone')
    .eq('id', user.id)
    .maybeSingle();
  check('profile', 'profile', profileError);
  if (!profileError && !profile?.onboarded) redirect('/onboarding');

  const nowIso = new Date().toISOString();
  const [
    { data: mySignals, error: mySignalsError },
    { data: circles, error: circlesError },
    { data: friendSignals, error: friendSignalsError },
    { data: pendingInvites, error: pendingInvitesError },
    { data: myInvites, error: myInvitesError },
    { data: recentMatches, error: recentMatchesError },
    { count: friendCount, error: friendCountError },
    { data: aroundAvailable, error: aroundAvailableError },
    { data: rememberedSignalCircle, error: rememberedSignalCircleError },
    { data: signalPeople, error: signalPeopleError },
    { data: signalGroups, error: signalGroupsError },
  ] = await Promise.all([
    supabase
      .from('availability_signals')
      .select('id, emoji, label, expires_at, circle_ids, person_ids, board_ids')
      .eq('user_id', user.id)
      .gt('expires_at', nowIso)
      .order('created_at'),
    supabase
      .from('circles')
      .select('id, name, emoji')
      .eq('owner_id', user.id)
      .order('created_at')
      .order('id'),
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
    // The plans you are actually part of. Everything you can *read* is wider
    // than that (see `homePlans`), so the feed is built from your own invite
    // rows plus what you host, not from every event RLS lets through.
    supabase
      .from('invites')
      .select('event_id, status')
      .eq('invitee_id', user.id)
      .in('status', ['accepted', 'queued']),
    // Via the function rather than the table: it drops the ones this person
    // has cleared *before* taking three, so clearing a card promotes the next
    // match up instead of just leaving a shorter list.
    supabase.rpc('my_recent_matches', { p_limit: 3 }),
    supabase
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    supabase.rpc('home_around_available'),
    supabase.rpc('my_signal_default_circle'),
    // The composer's "specific people": accepted connections, by name.
    supabase
      .from('connections')
      .select(
        'requester_id, addressee_id, requester:profiles!connections_requester_id_fkey(id, display_name), addressee:profiles!connections_addressee_id_fkey(id, display_name)',
      )
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    // And "a whole group": the boards RLS says this person belongs to.
    supabase.from('boards').select('id, name').order('name'),
  ]);
  check('signals', 'my-signals', mySignalsError);
  check('signals', 'circles', circlesError);
  check('signals', 'remembered-circle', rememberedSignalCircleError);
  check('signals', 'signal-people', signalPeopleError);
  check('signals', 'signal-groups', signalGroupsError);
  check('around', 'friend-signals', friendSignalsError);
  check('around', 'around-available', aroundAvailableError);
  check('invites', 'pending-invites', pendingInvitesError);
  check('plans', 'my-invites', myInvitesError);
  check('matches', 'recent-matches', recentMatchesError);
  check('connections', 'connection-count', friendCountError);

  const peopleForSignals = (signalPeople ?? [])
    .map((row) => {
      const otherRaw = row.requester_id === user.id ? row.addressee : row.requester;
      const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
      return other ? { id: other.id, name: other.display_name } : null;
    })
    .filter((person): person is { id: string; name: string } => person !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const hasConnections = (friendCount ?? 0) > 0;
  const acceptedEventIds = new Set(
    (myInvites ?? []).filter((i) => i.status === 'accepted').map((i) => i.event_id),
  );
  const queuedEventIds = new Set(
    (myInvites ?? []).filter((i) => i.status === 'queued').map((i) => i.event_id),
  );
  const partOfIds = [...new Set([...acceptedEventIds, ...queuedEventIds])];
  // Hosted, or one of the plans an invite row names. Ids are uuids from our
  // own rows, so the PostgREST filter string cannot carry anything else.
  const mineOrHosted =
    partOfIds.length > 0
      ? `host_id.eq.${user.id},id.in.(${partOfIds.join(',')})`
      : `host_id.eq.${user.id}`;
  // Only invitations a person can still act on, soonest first.
  const waitingOnYou = pendingInvitesInOrder(pendingInvites, new Date(nowIso));
  const defaultSignalCircleId = resolveDefaultSignalCircle(
    (circles ?? []).map((circle) => circle.id),
    typeof rememberedSignalCircle === 'string' ? rememberedSignalCircle : null,
  );

  // Innovations: matchmaker proposals, rituals, radar, energy prompts.
  const nowMs = new Date(nowIso).getTime();
  const threeDaysAgo = new Date(nowMs - 3 * 86_400_000).toISOString();
  const [
    { data: proposalRows, error: proposalError },
    { data: ritualRows, error: ritualError },
    radarResult,
    { data: recentPast, error: recentPastError },
    { data: energyLogged, error: energyLoggedError },
    { data: upcomingRows, error: upcomingError },
  ] = await Promise.all([
    supabase.rpc('my_matchmaker_proposals'),
    supabase
      .from('rituals')
      .select(
        'id, activity, cadence_days, status, due_on, creator_id, partner_id, creator:profiles!rituals_creator_id_fkey(display_name, sabbatical), partner:profiles!rituals_partner_id_fkey(display_name, sabbatical)',
      )
      .or(`creator_id.eq.${user.id},partner_id.eq.${user.id}`)
      .in('status', ['proposed', 'active']),
    // Radar reads with the service role and can throw on a malformed row; it
    // must never take the rest of Home with it.
    getReconnectionSuggestions(user.id).then(
      (suggestions) => ({ suggestions, error: null as unknown }),
      (error: unknown) => ({ suggestions: [], error }),
    ),
    // Only plans you hosted or said yes to: being asked how a plan you
    // declined left you feeling is a question with no answer.
    supabase
      .from('events')
      .select('id, title, starts_at, host_id, status')
      .or(mineOrHosted)
      .lt('starts_at', nowIso)
      .gte('starts_at', threeDaysAgo)
      .neq('status', 'cancelled')
      .limit(3),
    supabase.from('energy_logs').select('event_id').eq('user_id', user.id),
    // A plan with no date yet is still ahead of you, so it is not dropped by
    // the "already started" cut. Two `.or()` filters are ANDed by PostgREST.
    supabase
      .from('events')
      .select('*')
      .or(mineOrHosted)
      .in('status', ['confirmed', 'inviting', 'deciding'])
      .or(`starts_at.is.null,starts_at.gte.${nowIso}`)
      .order('starts_at', { ascending: true, nullsFirst: false })
      .limit(8),
  ]);
  check('introductions', 'matchmaker-proposals', proposalError);
  check('rituals', 'rituals', ritualError);
  check('radar', 'reconnection', radarResult.error);
  check('reflections', 'recent-past', recentPastError);
  check('reflections', 'energy-logged', energyLoggedError);
  check('plans', 'upcoming', upcomingError);
  const radar = radarResult.suggestions;

  const upcoming = homePlans(upcomingRows, {
    userId: user.id,
    acceptedEventIds,
    queuedEventIds,
    limit: 4,
  });

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

  const ritualToday = localDate(profile?.timezone);
  const rituals: RitualCardData[] = (ritualRows ?? [])
    .map((row) => {
      const isMine = row.creator_id === user.id;
      const otherRaw = isMine ? row.partner : row.creator;
      const meRaw = isMine ? row.creator : row.partner;
      const other = Array.isArray(otherRaw) ? otherRaw[0] : otherRaw;
      const me = Array.isArray(meRaw) ? meRaw[0] : meRaw;
      // Due by its stored date in your own zone (D8), and on hold while either
      // of you is on sabbatical (D6), the same rule the reminder follows.
      const due =
        !other?.sabbatical && !me?.sabbatical && ritualIsDue(row, ritualToday);
      return {
        id: row.id,
        activity: row.activity,
        otherName: other?.display_name ?? 'Friend',
        otherId: isMine ? row.partner_id : row.creator_id,
        cadenceDays: row.cadence_days,
        status: row.status,
        isMine,
        due,
        dueOn: row.due_on,
      };
    })
    .filter((ritual) => (ritual.status === 'proposed' && !ritual.isMine) || ritual.due);

  const loggedIds = new Set((energyLogged ?? []).map((log) => log.event_id));
  const energyPrompts = (recentPast ?? []).filter(
    (event) =>
      !loggedIds.has(event.id) &&
      (event.host_id === user.id || acceptedEventIds.has(event.id)),
  );

  // The getting-started card owns the first run; the passport only appears
  // after its steps are behind you, so a new user is never shown two progress
  // cards at once.
  const findableDone = findabilitySettled(await loadFindability());
  const gettingStartedDone =
    hasConnections &&
    upcoming.length > 0 &&
    (mySignals?.length ?? 0) > 0 &&
    findableDone;
  const passportSummary = gettingStartedDone
    ? passportProgress(await loadPassport(user.id))
    : { earned: 0, total: 0, done: false, next: null };

  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';
  // Timed by the reader's clock, never the server's — `new Date().getHours()`
  // here reads UTC on Vercel and told a 9am Pacific tester "Good afternoon".
  // The stored zone renders first; <Greeting> corrects it from the browser.
  const greeting = greetingFor(new Date(), profile?.timezone ?? 'UTC');
  await Promise.all(reads);

  return (
    <AppShell>
      <div className="space-y-8">
        <div>
          <Greeting name={firstName} initial={greeting} />
          <p className="text-sm text-ink-faint mt-1">
            Your invitations and plans, in the order they need you.
          </p>
        </div>

        {failed.has('profile') && <SectionError section="profile" />}

        {/* Invitations are the only time-sensitive thing on Home. Keep them
            directly below the greeting so a 390px viewport never buries the
            response behind discovery or setup UI. */}
        {failed.has('invites') && (
          <section>
            <SectionHeader title="Waiting on you" />
            <SectionError section="invites" />
          </section>
        )}
        {waitingOnYou.length > 0 && (
          <section>
            <SectionHeader title="Waiting on you" />
            <div className="space-y-2">
              {waitingOnYou.map(({ id, event }) => {
                return (
                  <Link key={id} href={`/events/${event.id}`} className="block group">
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

        {/* Plan feed - the heart of Home. A failed read is not "no plans":
            the empty state below invites you to start one, which is the
            wrong answer to give someone whose plans simply did not load. */}
        {failed.has('plans') ? (
          <section aria-label="Your plans">
            <SectionError section="plans" />
          </section>
        ) : upcoming.length > 0 ? (
          <section aria-label="Your plans" className="space-y-4">
            {upcoming.map((event, i) => (
              <PlanCard
                key={event.id}
                href={`/events/${event.id}`}
                title={event.title}
                color={planColor(i)}
                when={formatDateTime(event.starts_at, event.time_zone)}
                where={event.location_name ?? undefined}
                status={
                  event.status === 'confirmed'
                    ? 'Confirmed'
                    : event.status === 'deciding'
                      ? 'Deciding'
                      : undefined
                }
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
                  // A solid surface with the theme's own ink: white text on a
                  // quarter-white pill over the pink card fell below 4.5:1.
                  <span className="rounded-btn bg-card px-5 py-2.5 text-sm font-bold text-ink shadow-lift">
                    Start something
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
              Invite everyone at once, or one person at a time.
            </p>
          </div>
        )}

        {/* The composer always renders. It used to wait for the first accepted
            connection, which meant a new account's Home silently omitted a
            whole feature — and the feature index still pointed here, so anyone
            who followed it found nothing and read that as broken rather than as
            waiting. It now shows its own "nobody to tell yet" state, and
            refuses out loud instead of being absent. `hasConnections` was also
            the wrong test: a signal aimed at a board reaches fellow members you
            are not connected to, so someone on a board with no friends could
            use this and never saw it. SignalBar decides from the reach it was
            actually handed. */}
        <div id="signals" className="scroll-mt-20">
          {/* The composer decides "nobody to tell yet" from these reads, so a
              failed one would refuse out loud for the wrong reason. */}
          {failed.has('signals') ? (
            <SectionError section="signals" />
          ) : (
            <SignalBar
              active={mySignals ?? []}
              circles={circles ?? []}
              people={peopleForSignals}
              groups={signalGroups ?? []}
              defaultCircleId={defaultSignalCircleId}
            />
          )}
        </div>

        {/* Exactly one guidance card. Once first-run setup retires, the
            passport takes its place rather than stacking another explainer.
            The checklist stays mounted even then, because Settings' "show
            tips again" can bring it back for someone who finished it. */}
        {/* A checklist built from reads that failed would tick nothing and
            claim every step is still to do. */}
        {!failed.has('plans') && !failed.has('connections') && !failed.has('signals') && (
          <GettingStarted
            friendDone={hasConnections}
            planDone={upcoming.length > 0}
            signalDone={(mySignals?.length ?? 0) > 0}
            findableDone={findableDone}
            whenDone={
              gettingStartedDone ? (
                <PassportCard
                  earned={passportSummary.earned}
                  total={passportSummary.total}
                  nextLabel={passportSummary.next?.label ?? null}
                />
              ) : null
            }
          />
        )}

        {failed.has('connections') && <SectionError section="connections" />}

        {/* The product doors follow what needs attention now. A new account
            gets the three useful ones; Mutual and I'm free arrive with the
            first connection, and Around only when the city has something
            behind it (one boolean from the database, never a row). */}
        <PillarRow
          // Unknown is not "none": keep every door open rather than hide the
          // ones that wait for a first connection.
          hasConnections={hasConnections || failed.has('connections')}
          showAround={aroundAvailable === true}
        />

        {/* Matchmaker introductions */}
        {failed.has('introductions') && <SectionError section="introductions" />}
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
        {failed.has('rituals') && <SectionError section="rituals" />}
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
        {failed.has('radar') && <SectionError section="radar" />}
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
                  // Straight into a plan with them already on the list. This
                  // used to open Mutual, where nothing is sent unless they
                  // independently pick you back, under a label that promised
                  // to reach out.
                  href={`/events/new?invite=${suggestion.friendId}`}
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
                      <span className="text-xs font-bold text-terracotta-deep whitespace-nowrap">
                        Make a plan
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Post-event reflection */}
        {failed.has('reflections') && <SectionError section="reflections" />}
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
        {failed.has('around') && (
          <section>
            <SectionHeader title="Around right now" hint="People open to connecting" />
            <SectionError section="around" />
          </section>
        )}
        {(friendSignals?.length ?? 0) > 0 && (
          <section>
            <SectionHeader
              title="Around right now"
              hint="People open to connecting"
            />
            <div className="space-y-2">
              {(friendSignals ?? []).map((signal) => {
                const profileRow = Array.isArray(signal.profile)
                  ? signal.profile[0]
                  : signal.profile;
                const name = profileRow?.display_name ?? 'Friend';
                // A signal is an opening, so the card answers it: a plan with
                // them already invited and the signal as the working title.
                // It used to open their profile, which does not show the
                // signal, and offered nothing to do about it.
                const href = `/events/new?invite=${signal.user_id}&title=${encodeURIComponent(
                  signal.label,
                )}`;
                return (
                  <Link key={signal.id} href={href} className="block group">
                    <Card tone="sage" className="group-hover:shadow-lift transition-shadow">
                      <div className="flex items-center gap-3">
                        <Avatar name={name} seed={signal.user_id} size="sm" />
                        <span className="flex-1 text-sm">
                          <strong>{name}</strong>{' '}
                          <span className="text-ink-soft">
                            is <Glyph emoji={signal.emoji} size={14} className="inline -mt-0.5" /> {signal.label}
                          </span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="text-xs font-bold text-terracotta-deep whitespace-nowrap">
                            Make a plan
                          </span>
                          <span className="text-xs text-ink-faint whitespace-nowrap">
                            {formatRelative(signal.expires_at).replace('in ', '')} left
                          </span>
                        </span>
                      </div>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Fresh matches — each one clearable, by swipe or by button. */}
        {failed.has('matches') ? (
          <SectionError section="matches" />
        ) : (
          <RecentMatches matches={recentMatches ?? []} />
        )}
      </div>
    </AppShell>
  );
}
