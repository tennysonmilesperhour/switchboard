'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

// Baked into the client bundle at build time (see next.config.ts).
const CURRENT_BUILD = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
const POLL_MS = 60_000;

/**
 * Watches for a newer production build. Polls a tiny endpoint that reports the
 * live deployment's build id; when it differs from the build this client
 * loaded with, it surfaces a one-tap "refresh" toast. Useful for beta testers
 * and members who've kept a stale tab (or PWA) open across a deploy.
 */
export function VersionWatcher() {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    // No meaningful build id in local dev — nothing to compare against.
    if (CURRENT_BUILD === 'dev') return;

    let cancelled = false;

    async function check() {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data: { buildId?: string } = await res.json();
        if (!cancelled && data.buildId && data.buildId !== CURRENT_BUILD) {
          setStale(true);
        }
      } catch {
        // Offline or transient — try again on the next tick.
      }
    }

    const interval = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    // A tab restored from the back/forward cache may be running stale code;
    // re-check on restore so the toast can surface right away.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    check();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);

  if (!stale) return null;

  // Reload the current URL from the network so the newest deployment's HTML +
  // bundle replace this stale tab. bfcache can hand back the old page on a plain
  // reload, so restores re-check and reload again if still stale.
  function goToLatest() {
    window.location.reload();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none"
    >
      <button
        type="button"
        onClick={goToLatest}
        className="pointer-events-auto flex items-center gap-3 rounded-pill bg-ink text-paper px-4 py-2.5 shadow-lift animate-rise active:scale-[0.98] transition"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon name="sparkle" size={16} className="text-terracotta-deep" />
          A new version is available
        </span>
        <span className="rounded-pill bg-paper text-ink text-xs font-semibold px-3 py-1.5">
          Update
        </span>
      </button>
    </div>
  );
}
