import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Icon } from '@/components/ui/Icon';

/**
 * Header bell with a live badge of things waiting on the user — pending
 * invitations plus incoming connection requests. This works with zero push
 * config: the count is read straight from the DB on each render, so a fresh
 * invite is visible in-app even for someone who never enabled notifications.
 */
export async function NotificationBell() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let count = 0;
  if (user) {
    const [{ count: invites }, { count: requests }] = await Promise.all([
      supabase
        .from('invites')
        .select('id', { count: 'exact', head: true })
        .eq('invitee_id', user.id)
        .eq('status', 'sent'),
      supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('addressee_id', user.id)
        .eq('status', 'pending'),
    ]);
    count = (invites ?? 0) + (requests ?? 0);
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
