'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import { formatRelative } from '@/lib/format';
import {
  clearNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/actions/notifications';
import { loadOlderNotifications } from '@/lib/actions/notification-history';

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
 *
 * Two controls, because they answer two different wishes: "stop telling me
 * about these" (mark read — the badge goes out, the list stays) and "get rid of
 * these" (clear — the list empties). Both report what happened; the mark-read
 * call used to throw its result away, so a failure looked exactly like a
 * success that hadn't refreshed yet.
 *
 * The page renders the newest page; "Show older" appends the rest a page at a
 * time. Older pages live here rather than in the URL, and every action below
 * keeps them in step with what it did, so a mark-read or a clear never leaves
 * a stale older row looking unread.
 */
export function NotificationsFeed({
  notifications,
  totalUnread,
  hasOlder = false,
}: {
  notifications: FeedNotification[];
  totalUnread: number;
  hasOlder?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [loading, startLoading] = useTransition();
  const [older, setOlder] = useState<FeedNotification[]>([]);
  const [moreAvailable, setMoreAvailable] = useState(hasOlder);
  const confirm = useConfirm();
  const toast = useToast();

  // The newest page is re-rendered by the server after every action, so an
  // older row can reappear in it; show each notification once.
  const newestIds = new Set(notifications.map((n) => n.id));
  const shown = [...notifications, ...older.filter((n) => !newestIds.has(n.id))];

  function markOne(notification: FeedNotification) {
    if (notification.read_at) return;
    startTransition(async () => {
      const result = await markNotificationRead(notification.id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not update that.', result.code);
        return;
      }
      const now = new Date().toISOString();
      setOlder((rows) =>
        rows.map((row) => (row.id === notification.id ? { ...row, read_at: now } : row)),
      );
    });
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllNotificationsRead();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not mark those as read.', result.code);
        return;
      }
      const now = new Date().toISOString();
      setOlder((rows) => rows.map((row) => ({ ...row, read_at: row.read_at ?? now })));
    });
  }

  function showOlder() {
    const last = shown[shown.length - 1];
    if (!last) return;
    startLoading(async () => {
      try {
        const result = await loadOlderNotifications(last.created_at, last.id);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not load older notifications.', result.code);
          return;
        }
        setOlder((rows) => [...rows, ...(result.notifications ?? [])]);
        setMoreAvailable(Boolean(result.hasMore));
      } catch {
        toast.error('Could not load older notifications. Try again.', 'SB-NOTIFY-LOAD');
      }
    });
  }

  async function clearAll() {
    const confirmed = await confirm({
      title: 'Clear all notifications?',
      body: 'This empties the list. Your plans, requests, and messages stay where they are.',
      confirmLabel: 'Clear',
      danger: true,
    });
    if (!confirmed) return;
    startTransition(async () => {
      const result = await clearNotifications();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not clear those.', result.code);
        return;
      }
      setOlder([]);
      setMoreAvailable(false);
    });
  }

  return (
    <section>
      <SectionHeader
        title="Recent 🔔"
        hint={
          totalUnread > 0
            ? `${totalUnread} unread — tap one to mark it read`
            : 'All read'
        }
        action={
          <div className="flex shrink-0 gap-2">
            {totalUnread > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={markAll}
              >
                Mark all read
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={clearAll}
            >
              Clear
            </Button>
          </div>
        }
      />
      <div className="space-y-2">
        {shown.map((n) => {
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
      {moreAvailable && (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={loading}
            onClick={showOlder}
          >
            {loading ? 'Loading…' : 'Show older'}
          </Button>
        </div>
      )}
    </section>
  );
}
