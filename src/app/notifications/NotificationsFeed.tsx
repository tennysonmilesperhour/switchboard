'use client';

import Link from 'next/link';
import { useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { formatRelative } from '@/lib/format';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/actions/notifications';

export interface FeedNotification {
  id: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
}

/**
 * The durable-notifications feed. Unread items are unmistakable — gold card,
 * terracotta dot, "New" chip — and stay unread until the user opens them or
 * taps "Mark all as read". Reading is an explicit acknowledgement, never a
 * side effect of merely loading the page, so the bell badge always points at
 * something the user can actually see and clear.
 */
export function NotificationsFeed({
  notifications,
  totalUnread,
}: {
  notifications: FeedNotification[];
  totalUnread: number;
}) {
  const [pending, startTransition] = useTransition();

  function markOne(notification: FeedNotification) {
    if (notification.read_at) return;
    startTransition(async () => {
      await markNotificationRead(notification.id);
    });
  }

  return (
    <section>
      <SectionHeader
        title="Recent 🔔"
        hint={
          totalUnread > 0
            ? `${totalUnread} unread — tap one to mark it read`
            : 'All caught up'
        }
        action={
          totalUnread > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await markAllNotificationsRead();
                })
              }
            >
              {pending ? 'Marking…' : 'Mark all as read'}
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-2">
        {notifications.map((n) => {
          const unread = !n.read_at;
          const card = (
            <Card
              tone={unread ? 'gold' : undefined}
              className="group-hover:shadow-lift transition-shadow"
            >
              <div className="flex items-start gap-2.5">
                {unread && (
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full bg-terracotta"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm ${unread ? 'font-bold' : 'font-medium'}`}>
                    {n.title}
                  </p>
                  {n.body ? (
                    <p className="text-xs text-ink-soft mt-0.5">{n.body}</p>
                  ) : null}
                  <p className="text-xs text-ink-faint mt-1">
                    {formatRelative(n.created_at)}
                  </p>
                </div>
                {unread && (
                  <span className="shrink-0 rounded-pill bg-terracotta px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    New
                  </span>
                )}
              </div>
            </Card>
          );

          if (n.url) {
            return (
              <Link
                key={n.id}
                href={n.url}
                className="block group"
                onClick={() => markOne(n)}
              >
                {card}
              </Link>
            );
          }
          if (unread) {
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => markOne(n)}
                disabled={pending}
                className="block group w-full text-left"
                aria-label={`Mark “${n.title}” as read`}
              >
                {card}
              </button>
            );
          }
          return <div key={n.id}>{card}</div>;
        })}
      </div>
    </section>
  );
}
