'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  bannerFromRow,
  type NotificationBanner,
  type NotificationRow,
} from '@/lib/notification-banner';

/** How long a banner sits before it slides away on its own. */
const DISMISS_MS = 6500;
/** Never stack more than this many at once — a burst should inform, not bury. */
const MAX_VISIBLE = 3;

interface LiveNotificationsProps {
  /** The signed-in person. Resolved server-side in the root layout so the
   *  subscription filter can never be spoofed by the client. */
  userId: string;
}

/**
 * Surfaces a banner at the top of the app the moment a notification lands for
 * the signed-in user — a new room message, a match, an accepted connection, a
 * reminder — in addition to the bell badge, which this also refreshes.
 *
 * Every one of those events already writes a row to `public.notifications`
 * (see notifyUsers), so this subscribes once to INSERTs on that table filtered
 * to the current user. RLS restricts delivery to the recipient, so the filter
 * is defence-in-depth, not the boundary. Mounted once in the root layout, above
 * the router, so it survives navigation and never misses an event mid-transition.
 */
export function LiveNotifications({ userId }: LiveNotificationsProps) {
  const [banners, setBanners] = useState<NotificationBanner[]>([]);
  const router = useRouter();

  // Dedupe re-delivered events, and coalesce a burst of refreshes into one so
  // the server-rendered bell isn't re-fetched five times in two seconds.
  const seen = useRef<Set<string>>(new Set());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;

    const scheduleRefresh = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, 400);
    };

    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null =
      null;

    try {
      const supabase = createClient();
      channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as NotificationRow;
            if (!row?.id || seen.current.has(row.id)) return;
            seen.current.add(row.id);

            // The bell count should update whether or not the tab is focused;
            // the banner itself is a live-attention surface, so only raise it
            // while the tab is actually being looked at. When they come back,
            // the bell and /notifications already hold it.
            scheduleRefresh();
            if (document.visibilityState !== 'visible') return;

            const banner = bannerFromRow(row);
            setBanners((current) =>
              [...current, banner].slice(-MAX_VISIBLE),
            );
          },
        )
        .subscribe();
    } catch {
      // Realtime unavailable/unconfigured (e.g. missing env in a preview) — the
      // bell and feed still work; we simply don't get live banners.
      channel = null;
    }

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      if (channel) channel.unsubscribe();
    };
    // Banners state is only ever updated through the functional setter, so the
    // effect depends on nothing but the user identity and the router.
  }, [userId, router]);

  if (banners.length === 0) return null;

  const remove = (id: string) =>
    setBanners((current) => current.filter((b) => b.id !== id));

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="New activity"
      className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pointer-events-none"
    >
      {banners.map((banner) => (
        <BannerCard key={banner.id} banner={banner} onDismiss={() => remove(banner.id)} />
      ))}
    </div>
  );
}

function BannerCard({
  banner,
  onDismiss,
}: {
  banner: NotificationBanner;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const inner = (
    <>
      <span className="text-lg leading-none" aria-hidden>
        {banner.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold">{banner.title}</span>
        {banner.body && (
          <span className="block truncate text-xs text-paper/80">{banner.body}</span>
        )}
      </span>
    </>
  );

  return (
    <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-card bg-ink px-4 py-3 text-paper shadow-float animate-rise">
      {banner.url ? (
        <Link
          href={banner.url}
          onClick={onDismiss}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-mr-1 shrink-0 rounded-full p-1 text-paper/70 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/60"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
