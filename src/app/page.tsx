import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { SignalBar } from '@/components/signals/SignalBar';
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
            Feeling social? Let people know — quietly.
          </p>
        </div>

        <SignalBar active={mySignal ?? null} circles={circles ?? []} />

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
                      <strong>{match.activity}</strong> — it’s mutual!{' '}
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
