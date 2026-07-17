import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/shell/AppShell';
import { Card, SectionHeader } from '@/components/ui/Card';
import { NotificationsFeed } from './NotificationsFeed';
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
    { count: unreadCount },
  ] = await Promise.all([
    // Only invites the user can still act on: an unanswered invite to an event
    // that already started would otherwise sit in "Waiting on you" (and light
    // the bell badge) forever with no way to clear it.
    supabase
      .from('invites')
      .select('id, event:events!inner(id, title, starts_at, time_zone)')
      .eq('invitee_id', user.id)
      .eq('status', 'sent')
      .gte('event.starts_at', new Date().toISOString()),
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
    // True unread total (not just within the 20 shown): the badge and the
    // "Mark all as read" control must agree even when older unread rows have
    // scrolled out of the visible feed.
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
  ]);

  const invites = pendingInvites ?? [];
  const matchList = matches ?? [];
  const announcementList = announcements ?? [];
  const requestList = connectionRequests ?? [];
  const notificationList = recentNotifications ?? [];
  const totalUnread = unreadCount ?? 0;

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
            <NotificationsFeed
              notifications={notificationList}
              totalUnread={totalUnread}
            />
          )}

          {invites.length > 0 && (
            <section>
              <SectionHeader
                title="Waiting on you 💌"
                hint="These keep the bell badge on until you respond"
              />
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
              <SectionHeader
                title="Wants to connect 👋"
                hint="Accept or ignore in People — these also keep the bell badge on"
              />
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
