import Link from 'next/link';
import { createClient, getRenderUser } from '@/lib/supabase/server';
import { Icon } from '@/components/ui/Icon';

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

/**
 * Header bell with a live badge of unread notifications.
 *
 * The badge counts unread rows in `public.notifications` and **nothing else**.
 * That is a rule, not an implementation detail, and `notification-badge.test.ts`
 * fails if this file ever queries another table for the count.
 *
 * It used to add two more counts — invitations still sitting at `sent`, and
 * incoming connection requests — from back before the notifications table
 * existed. Both of those events write a notifications row of their own now
 * (`event_invite`, `connection_request`), so one invitation lit the badge
 * twice; and the copy of it that came from the `invites` table could not be
 * cleared from the notifications screen at all. Reading everything and clearing
 * the feed left a badge that would not go out, pointing at nothing the reader
 * could do anything about from there. Whatever the bell shows must be
 * answerable by the screen the bell opens.
 *
 * Invitations and connection requests are still *shown* on /notifications, and
 * still live on /plans and /people where they can actually be answered.
 *
 * The count is read straight from the DB on each render, so this works with
 * zero push config: a fresh notification is visible in-app even to someone who
 * never enabled notifications.
 */
export async function NotificationBell() {
  // The bell lives in the shared shell, so it must never crash a page. If
  // Supabase isn't configured or the lookup fails for any reason, fall back to
  // a plain, badgeless bell instead of throwing.
  let count = 0;
  try {
    const supabase = await createClient();
    const user = await getRenderUser();
    if (user) {
      // Every event worth a badge writes one of these — invitations, connection
      // requests and accepts, matches, join approvals, reminders, messages.
      const { count: unread } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('read_at', null);
      count = unread ?? 0;
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
