'use client';

import { useEffect } from 'react';

/**
 * Registers the PWA service worker (`/sw.js`) on load for every browser that
 * supports it — independent of push feature-detection. Push subscription (which
 * needs `PushManager` + VAPID) is handled separately in `src/lib/client/push.ts`;
 * coupling registration to it meant the SW never registered on iOS Safari or any
 * non-push browser, so offline/caching and `serviceWorker.ready` never worked.
 * Renders nothing.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration failures are non-fatal — the app works online without it.
    });
  }, []);
  return null;
}
