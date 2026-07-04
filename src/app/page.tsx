import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { SignalBar } from '@/components/signals/SignalBar';
import {
  EnergyPrompt,
  MatchmakerCard,
  RitualCard,
  type ProposalCardData,
  type RitualCardData,
} from '@/components/home/HomeCards';
import { getReconnectionSuggestions } from '@/lib/server/radar';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SwitchboardEvent } from '@/lib/types';

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/welcome');

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, onboarded')
    .eq('id', user.id)
    .single();
  if (!profile?.onboarded) redirect('/onboarding');

  const nowIso = new Date().toISOString();
  const [
    { data: mySignal },
    { data: circles },
    { data: friendSignals },
    { data: pendingInvites },
    { data: upcoming },
    { data: recentMatches },
  ] = await Promise.all([
    supabase
      .from('availability_signals')
      .select('emoji, label, expires_at, circle_id')
      .eq('user_id', user.id)
      .gt('expires_at', nowIso)
      .maybeSingle(),
    supabase.from('circles').select('id, name, emoji').eq('owner_id', user.id),
    supabase
      .from('availability_signals')
      .select('id, emoji, label, expires_at, user_id, profile:profiles(display_name)')
      .neq('user_id', user.id)
      .gt('expires_at', nowIso)
      .limit(12),
    supabase
      .from('invites')
      .select('id, event:events(id, title, starts_at)')
      .eq('invitee_id', user.id)
      .eq('status', 'sent'),
    supabase
      .from('events')
      .select('*')
      .in('status', ['confirmed', 'inviting', 'deciding'])
      .gte('starts_at', nowIso)
      .order('starts_at')
      .limit(4),
    supabase
      .from('matches')
      .select('id, activity, room_id, created_at, user_a, user_b')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(3),
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

  const firstName = profile.display_name.split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <AppShell
      action={
        <Link
          href="/settings"
          aria-label="Settings"
          className="size-9 inline-flex items-center justify-center rounded-full text-ink-soft hover:bg-cream"
        >
          ⚙
        </Link>
      }
    >
      <div className="space-y-8">
        <div>
          <h1 className="font-display text-3xl text-ink">
            {greeting}, {firstName}.
          </h1>
          <p className="text-sm text-ink-faint mt-1">
            Feeling social? Let people know - quietly.
          </p>
        </div>

        <SignalBar active={mySignal ?? null} circles={circles ?? []} />

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
                return (
                  <Link key={signal.id} href="/mutual" className="block group">
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
                const event = (
                  Array.isArray(invite.event) ? invite.event[0] : invite.event
                ) as Pick<SwitchboardEvent, 'id' | 'title' | 'starts_at'> | null;
                if (!event) return null;
                return (
                  <Link key={invite.id} href={`/events/${event.id}`} className="block group">
                    <Card tone="gold" className="group-hover:shadow-lift transition-shadow">
                      <p className="font-medium">{event.title}</p>
                      <p className="text-xs text-ink-soft mt-0.5">
                        {formatDateTime(event.starts_at)} · respond soon
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Fresh matches */}
        {(recentMatches?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="Recent matches ✨" />
            <div className="space-y-2">
              {(recentMatches ?? []).map((match) => (
                <Link
                  key={match.id}
                  href={match.room_id ? `/rooms/${match.room_id}` : '/mutual'}
                  className="block group"
                >
                  <Card className="group-hover:border-terracotta transition-colors">
                    <p className="text-sm">
                      <strong>{match.activity}</strong> - it’s mutual!{' '}
                      <span className="text-ink-faint">
                        {formatRelative(match.created_at)}
                      </span>
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming */}
        {(upcoming?.length ?? 0) > 0 && (
          <section>
            <SectionHeader title="Coming up" />
            <div className="space-y-2">
              {(upcoming as SwitchboardEvent[]).map((event) => (
                <Link key={event.id} href={`/events/${event.id}`} className="block group">
                  <Card className="group-hover:border-terracotta transition-colors">
                    <p className="font-medium">{event.title}</p>
                    <p className="text-xs text-ink-soft mt-0.5">
                      {formatDateTime(event.starts_at)}
                      {event.location_name ? ` · ${event.location_name}` : ''}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section>
          <SectionHeader title="Make something happen" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/events/new', emoji: '🪜', title: 'New plan', body: 'Cascading invites' },
              { href: '/discover', emoji: '🧭', title: 'Discover', body: 'What should we do?' },
              { href: '/mutual', emoji: '◐', title: 'Mutual', body: 'Down to connect?' },
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
        </section>
      </div>
    </AppShell>
  );
}
