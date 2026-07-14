import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDateTime, formatRelative } from '@/lib/format';
import type { SwitchboardEvent } from '@/lib/types';

export const metadata: Metadata = { title: 'Notifications' };

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/welcome');

  const [
    { data: pendingInvites },
    { data: matches },
    { data: announcements },
    { data: connectionRequests },
    { data: recentNotifications },
  ] = await Promise.all([
    supabase
      .from('invites')
      .select('id, event:events(id, title, starts_at, time_zone)')
      .eq('invitee_id', user.id)
      .eq('status', 'sent'),
    supabase
      .from('matches')
      .select('id, activity, room_id, created_at, user_a, user_b')
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
      .order('created_at', { ascending: false })
      .limit(8),
    // RLS scopes announcements to events the user can see.
    supabase
      .from('announcements')
      .select('id, body, created_at, event:events(id, title)')
      .order('created_at', { ascending: false })
      .limit(12),
    // Incoming connection requests waiting on this user (RLS: addressee only).
    supabase
      .from('connections')
      .select(
        'id, created_at, requester:profiles!connections_requester_id_fkey(id, display_name, handle)',
      )
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(12),
    // Durable notifications: everything that used to be push-only lands here.
    supabase
      .from('notifications')
      .select('id, kind, title, body, url, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const invites = pendingInvites ?? [];
  const matchList = matches ?? [];
  const announcementList = announcements ?? [];
  const requestList = connectionRequests ?? [];
  const notificationList = recentNotifications ?? [];

  // Viewing the page clears the unread badge.
  if (notificationList.some((n) => !n.read_at)) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);
  }

  const isEmpty =
    invites.length === 0 &&
    matchList.length === 0 &&
    announcementList.length === 0 &&
    requestList.length === 0 &&
    notificationList.length === 0;

  return (
    <AppShell title="Notifications" back="/">
      {isEmpty ? (
        <EmptyState
          emoji="🔔"
          title="You’re all caught up"
          body="Invitations, matches, and host announcements will land here. Nothing needs you right now."
        />
      ) : (
        <div className="space-y-8">
          {notificationList.length > 0 && (
            <section>
              <SectionHeader title="Recent 🔔" />
              <div className="space-y-2">
                {notificationList.map((n) => {
                  const card = (
                    <Card
                      tone={n.read_at ? undefined : 'gold'}
                      className="group-hover:shadow-lift transition-shadow"
                    >
                      <p className="text-sm font-medium">{n.title}</p>
                      {n.body ? (
                        <p className="text-xs text-ink-soft mt-0.5">{n.body}</p>
                      ) : null}
                      <p className="text-xs text-ink-faint mt-1">
                        {formatRelative(n.created_at)}
                      </p>
                    </Card>
                  );
                  return n.url ? (
                    <Link key={n.id} href={n.url} className="block group">
                      {card}
                    </Link>
                  ) : (
                    <div key={n.id}>{card}</div>
                  );
                })}
              </div>
            </section>
          )}

          {invites.length > 0 && (
            <section>
              <SectionHeader title="Waiting on you 💌" />
              <div className="space-y-2">
                {invites.map((invite) => {
                  const event = (
                    Array.isArray(invite.event) ? invite.event[0] : invite.event
                  ) as Pick<
                    SwitchboardEvent,
                    'id' | 'title' | 'starts_at' | 'time_zone'
                  > | null;
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

          {requestList.length > 0 && (
            <section>
              <SectionHeader title="Wants to connect 👋" hint="Accept or ignore in People" />
              <div className="space-y-2">
                {requestList.map((request) => {
                  const requester = (
                    Array.isArray(request.requester)
                      ? request.requester[0]
                      : request.requester
                  ) as { id: string; display_name: string; handle: string | null } | null;
                  if (!requester) return null;
                  return (
                    <Link key={request.id} href="/people" className="block group">
                      <Card tone="sage" className="group-hover:shadow-lift transition-shadow">
                        <p className="text-sm">
                          <strong>{requester.display_name}</strong>
                          {requester.handle ? (
                            <span className="text-ink-faint"> @{requester.handle}</span>
                          ) : null}{' '}
                          wants to connect{' '}
                          <span className="text-ink-faint">
                            {formatRelative(request.created_at)}
                          </span>
                        </p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {matchList.length > 0 && (
            <section>
              <SectionHeader title="Matches ✨" hint="You both chose each other" />
              <div className="space-y-2">
                {matchList.map((match) => (
                  <Link
                    key={match.id}
                    href={match.room_id ? `/rooms/${match.room_id}` : '/mutual'}
                    className="block group"
                  >
                    <Card tone="sage" className="group-hover:shadow-lift transition-shadow">
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

          {announcementList.length > 0 && (
            <section>
              <SectionHeader title="From your hosts 📣" />
              <div className="space-y-2">
                {announcementList.map((announcement) => {
                  const event = (
                    Array.isArray(announcement.event)
                      ? announcement.event[0]
                      : announcement.event
                  ) as Pick<SwitchboardEvent, 'id' | 'title'> | null;
                  return (
                    <Link
                      key={announcement.id}
                      href={event ? `/events/${event.id}` : '/'}
                      className="block group"
                    >
                      <Card className="group-hover:border-terracotta transition-colors">
                        <p className="text-sm">{announcement.body}</p>
                        <p className="text-xs text-ink-faint mt-1">
                          {event?.title ? `${event.title} · ` : ''}
                          {formatRelative(announcement.created_at)}
                        </p>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
