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

  const [{ data: pendingInvites }, { data: matches }, { data: announcements }] =
    await Promise.all([
      supabase
        .from('invites')
        .select('id, event:events(id, title, starts_at)')
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
    ]);

  const invites = pendingInvites ?? [];
  const matchList = matches ?? [];
  const announcementList = announcements ?? [];
  const isEmpty =
    invites.length === 0 &&
    matchList.length === 0 &&
    announcementList.length === 0;

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
          {invites.length > 0 && (
            <section>
              <SectionHeader title="Waiting on you 💌" />
              <div className="space-y-2">
                {invites.map((invite) => {
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
