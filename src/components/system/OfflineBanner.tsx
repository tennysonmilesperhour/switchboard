'use client';

import { useOffline } from 'next/offline';

/**
 * Says so when the device loses its connection, on every page.
 *
 * Without it the first sign of being offline was a tap that failed: a link
 * whose page never arrived, which the route error boundary then showed as a
 * crash. `experimental.useOffline` (next.config.ts) now holds that navigation
 * or form submit and runs it when the connection returns, so this banner is
 * the only explanation for why nothing is happening yet. The framework's state
 * also covers a connection that reads as online but reaches nothing (captive
 * wifi), which `navigator.onLine` misses.
 */
export function OfflineBanner() {
  const offline = useOffline();

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]"
    >
      <p className="pointer-events-auto rounded-pill bg-ink px-4 py-2 text-xs font-semibold text-paper shadow-float">
        You’re offline. What’s on screen stays put; new pages will open once you’re back.
      </p>
    </div>
  );
}
