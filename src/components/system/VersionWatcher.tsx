'use client';

import { useEffect, useState } from 'react';

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
    document.addEventListener('visibilitychange', onVisible);
    check();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!stale) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-4 pointer-events-none"
    >
      <div className="pointer-events-auto flex items-center gap-3 rounded-pill bg-ink text-paper px-4 py-2.5 shadow-lift animate-rise">
        <span className="text-sm font-medium">A new version is available</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-pill bg-paper text-ink text-xs font-semibold px-3 py-1.5 hover:opacity-90 active:scale-[0.97] transition"
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
