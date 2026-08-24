import Link from 'next/link';
import { createClient, getRenderUser } from '@/lib/supabase/server';
import { Icon } from '@/components/ui/Icon';

/**
 * Header bell with a live badge of things waiting on the user — pending
 * invitations plus incoming connection requests. This works with zero push
 * config: the count is read straight from the DB on each render, so a fresh
 * invite is visible in-app even for someone who never enabled notifications.
 */
/** The bell's frame, with no count on it yet.
 *
 * Rendered as the Suspense fallback while the badge counts are still in flight,
 * so the shell — and every route's `loading.tsx`, which renders this same
 * `AppShell` — paints on the first flush instead of waiting on the bell's own
 * round trips. Deliberately the same glyph in the same 36px slot as the settled
 * bell, so the badge appearing later changes a corner, not the layout. */
export function BellPlaceholder() {
  return (
    <span
      aria-hidden
      className="relative size-9 inline-flex items-center justify-center rounded-full text-terracotta-deep"
    >
      <Icon name="bell" size={22} />
    </span>
  );
}

export async function NotificationBell() {
  // The bell lives in the shared shell, so it must never crash a page. If
  // Supabase isn't configured or the lookup fails for any reason, fall back to
  // a plain, badgeless bell instead of throwing.
  let count = 0;
  try {
    const supabase = await createClient();
    const user = await getRenderUser();
    if (user) {
      const [{ count: invites }, { count: requests }, { count: unread }] = await Promise.all([
        // Only invites to events that haven't started: a never-answered invite
        // to a past event used to keep the badge lit forever with nothing
        // actionable shown on /notifications to clear it.
        supabase
          .from('invites')
          .select('id, event:events!inner(id)', { count: 'exact', head: true })
          .eq('invitee_id', user.id)
          .eq('status', 'sent')
          .gte('event.starts_at', new Date().toISOString()),
        supabase
          .from('connections')
          .select('id', { count: 'exact', head: true })
          .eq('addressee_id', user.id)
          .eq('status', 'pending'),
        // Unread durable notifications — connection accepts, matches, join
        // approvals, reminders, and everything else that's no longer push-only.
        supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null),
      ]);
      count = (invites ?? 0) + (requests ?? 0) + (unread ?? 0);
    }
  } catch {
    // Supabase unavailable/unconfigured — render the bell without a badge.
  }

  const label = count > 0 ? `Notifications, ${count} waiting` : 'Notifications';

  return (
    <Link
      href="/notifications"
      aria-label={label}
      className="relative size-9 inline-flex items-center justify-center rounded-full text-terracotta-deep hover:bg-cream"
    >
      <Icon name="bell" size={22} />
      {count > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-terracotta text-white text-[10px] font-bold leading-none ring-2 ring-paper"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Link>
  );
}
