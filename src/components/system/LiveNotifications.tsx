'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { subscribeAuthorized } from '@/lib/supabase/realtime';
import {
  bannerFromRow,
  parseNotificationRow,
  type NotificationBanner,
} from '@/lib/notification-banner';
import {
  swipeAxis,
  swipeFrame,
  swipeRelease,
  type SwipeConfig,
} from '@/lib/swipe-dismiss';
import { freshNotificationMoment } from './live-notification-events';

/** How long a banner sits before it slides away on its own. */
const DISMISS_MS = 6500;
/** Never stack more than this many at once — a burst should inform, not bury. */
const MAX_VISIBLE = 3;
/** How long the fly-out runs before the banner is actually removed. */
const EXIT_MS = 200;

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
 * (see notifyUsers), so this subscribes once to that table filtered to the
 * current user — INSERTs, and UPDATEs too, because a coalescing notifier (room
 * messages, poll ideas) rewrites its standing unread row instead of adding
 * another (see live-notification-events.ts). RLS restricts delivery to the
 * recipient, so the filter is defence-in-depth, not the boundary. Mounted once
 * in the root layout, above the router, so it survives navigation and never
 * misses an event mid-transition.
 *
 * A banner leaves three ways: swiped up or to either side, tapped on its close
 * button, or left alone for a few seconds. The swipe is the one people reach
 * for first, because every other notification on the device works that way.
 */
export function LiveNotifications({ userId }: LiveNotificationsProps) {
  const [banners, setBanners] = useState<NotificationBanner[]>([]);
  const router = useRouter();

  // Dedupe re-delivered events, and coalesce a burst of refreshes into one so
  // the server-rendered bell isn't re-fetched five times in two seconds.
  const seen = useRef<Set<string>>(new Set());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable, so a second banner arriving doesn't hand the first a new callback
  // and restart the countdown it was already part-way through.
  const remove = useCallback((id: string) => {
    setBanners((current) => current.filter((b) => b.id !== id));
  }, []);

  useEffect(() => {
    if (!userId) return;

    const scheduleRefresh = () => {
      if (refreshTimer.current) return;
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null;
        router.refresh();
      }, 400);
    };

    let stop: (() => void) | null = null;

    const onChange = (value: Record<string, unknown>) => {
      // Any change moves the bell: a new row, a bump, or a row marked read.
      scheduleRefresh();
      const moment = freshNotificationMoment(value);
      const row = parseNotificationRow(value);
      if (!moment || !row?.id || seen.current.has(moment)) return;
      seen.current.add(moment);

      // The bell count should update whether or not the tab is focused; the
      // banner itself is a live-attention surface, so only raise it while the
      // tab is actually being looked at. When they come back, the bell and
      // /notifications already hold it.
      if (document.visibilityState !== 'visible') return;

      const banner = bannerFromRow(row);
      // A bumped row replaces its own earlier banner rather than stacking.
      setBanners((current) =>
        [...current.filter((b) => b.id !== banner.id), banner].slice(-MAX_VISIBLE),
      );
    };

    try {
      const supabase = createClient();
      const filter = `user_id=eq.${userId}`;
      const channel = supabase
        .channel(`notifications:${userId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'notifications', filter },
          (payload) => onChange(payload.new),
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'notifications', filter },
          (payload) => onChange(payload.new),
        );
      stop = subscribeAuthorized(supabase, channel);
    } catch {
      // Realtime unavailable/unconfigured (e.g. missing env in a preview) — the
      // bell and feed still work; we simply don't get live banners.
      stop = null;
    }

    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = null;
      stop?.();
    };
    // Banners state is only ever updated through the functional setter, so the
    // effect depends on nothing but the user identity and the router.
  }, [userId, router]);

  if (banners.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="New activity"
      className="fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pointer-events-none"
    >
      {banners.map((banner) => (
        <BannerCard key={banner.id} banner={banner} onDismiss={remove} />
      ))}
    </div>
  );
}

function BannerCard({
  banner,
  onDismiss: remove,
}: {
  banner: NotificationBanner;
  onDismiss: (id: string) => void;
}) {
  const onDismiss = useCallback(() => remove(banner.id), [remove, banner.id]);
  const card = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointerId: number; x: number; y: number; at: number } | null>(
    null,
  );
  const size = useRef<SwipeConfig>({ width: 0, height: 0 });
  const [frame, setFrame] = useState({ x: 0, y: 0, opacity: 1 });
  /** True once a gesture has committed to an axis and the card is following. */
  const [dragging, setDragging] = useState(false);
  /** Set while the banner is flying out, so it animates instead of jumping. */
  const [leaving, setLeaving] = useState(false);

  // A swipe that has committed to an axis must not also open the notification
  // when the finger lifts, so the link swallows that one click.
  const swiped = useRef(false);

  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leave = useCallback(
    (to: { x: number; y: number; opacity: number }) => {
      setLeaving(true);
      setFrame(to);
      exitTimer.current = setTimeout(onDismiss, EXIT_MS);
    },
    [onDismiss],
  );

  useEffect(() => () => {
    if (exitTimer.current) clearTimeout(exitTimer.current);
  }, []);

  useEffect(() => {
    // A banner should not evaporate out from under the thumb that is holding
    // it, or race the fly-out it is already running.
    if (dragging || leaving) return;
    const timer = setTimeout(onDismiss, DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss, dragging, leaving]);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    // Mouse drags are not how anyone dismisses a banner, and capturing them
    // would break text selection and the close button. Touch and pen only.
    if (leaving || event.pointerType === 'mouse') return;
    const rect = card.current?.getBoundingClientRect();
    size.current = { width: rect?.width ?? 0, height: rect?.height ?? 0 };
    gesture.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      at: Date.now(),
    };
    swiped.current = false;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const delta = { dx: event.clientX - start.x, dy: event.clientY - start.y };
    if (!swiped.current && swipeAxis(delta) !== null) {
      swiped.current = true;
      setDragging(true);
      // Take the pointer once the gesture is real: the banner sits over the
      // page, and without this the scroll underneath keeps the move events.
      card.current?.setPointerCapture(event.pointerId);
    }
    if (swiped.current) setFrame(swipeFrame(delta, size.current));
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    gesture.current = null;
    setDragging(false);
    if (card.current?.hasPointerCapture(event.pointerId)) {
      card.current.releasePointerCapture(event.pointerId);
    }
    if (!swiped.current) return;

    const release = swipeRelease(
      {
        dx: event.clientX - start.x,
        dy: event.clientY - start.y,
        elapsedMs: Date.now() - start.at,
      },
      size.current,
    );
    if (release.dismiss) leave(release);
    else setFrame({ x: 0, y: 0, opacity: 1 });
  }

  function onPointerCancel() {
    gesture.current = null;
    swiped.current = false;
    setDragging(false);
    setFrame({ x: 0, y: 0, opacity: 1 });
  }

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
    // The entrance animation and the swipe both drive `transform`, and a
    // running animation wins over an inline style — so they get an element
    // each. The wrapper rises in; the card inside it follows the finger.
    <div className="pointer-events-auto w-full max-w-md animate-rise">
      <div
        ref={card}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        style={{
          transform: `translate3d(${frame.x}px, ${frame.y}px, 0)`,
          opacity: frame.opacity,
          // No transition while a finger is down — the banner should track it
          // exactly. The spring back and the fly-out are the animated moments.
          transition: leaving
            ? `transform ${EXIT_MS}ms var(--ease-out-expo), opacity ${EXIT_MS}ms linear`
            : dragging
              ? 'none'
              : 'transform var(--duration-fast) var(--ease-out-expo), opacity var(--duration-fast) linear',
        }}
        className="flex touch-none items-center gap-3 rounded-card bg-ink px-4 py-3 text-paper shadow-float"
      >
        {banner.url ? (
          <Link
            href={banner.url}
            // A swipe ends with a click on the link underneath it. Without this
            // the banner would fly out and navigate at the same time.
            onClick={(event) => {
              if (swiped.current) {
                event.preventDefault();
                return;
              }
              onDismiss();
            }}
            draggable={false}
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
          className="-my-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-paper/70 hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/60"
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
    </div>
  );
}
