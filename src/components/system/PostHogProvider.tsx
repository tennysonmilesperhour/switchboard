'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { useEffect } from 'react';

/**
 * Client-side PostHog: web/performance analytics and error (exception) tracking.
 * This is the browser-SDK counterpart to the server capture layer
 * (src/lib/analytics/server.ts) and, like it, is a no-op until a key is set and
 * never blocks a user action.
 *
 * A PostHog project API key (`phc_…`) is public by design — it ships to the
 * browser — so it lives in NEXT_PUBLIC_POSTHOG_KEY, not a server secret.
 *
 * Ingestion and PostHog's lazily-loaded assets go through a same-origin reverse
 * proxy (`/ingest`, see next.config.ts). That keeps everything `'self'` under
 * the strict per-request CSP (src/proxy.ts) — no widening of script-src or
 * connect-src — and sidesteps ad-blockers.
 */
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;

// Module-scoped guard so React StrictMode's double-invoked effect (dev) and any
// remount never re-initialise the SDK.
let initialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (!POSTHOG_KEY || initialized) return;
    initialized = true;

    posthog.init(POSTHOG_KEY, {
      api_host: '/ingest',
      ui_host: 'https://us.posthog.com',
      // Modern defaults: automatic single-page pageview + pageleave capture that
      // tracks the App Router's client-side navigations.
      defaults: '2025-05-24',
      // Error tracking — the "bugs" half of the ask. Surfaces unhandled
      // exceptions and promise rejections as issues in PostHog.
      capture_exceptions: true,
      // Performance analytics — Web Vitals (LCP/INP/CLS) plus network timing.
      capture_performance: true,
      // Session replay is out of scope for this pass; keeping it off also avoids
      // blob:-worker CSP concerns.
      disable_session_recording: true,
      // Tag every client event so Switchboard's data stays cleanly separable
      // from the other product that shares this PostHog project.
      before_send: (event) => {
        if (event) {
          event.properties = { ...event.properties, app: 'switchboard' };
        }
        return event;
      },
    });
  }, []);

  if (!POSTHOG_KEY) return <>{children}</>;
  return <PHProvider client={posthog}>{children}</PHProvider>;
}
