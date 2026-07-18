import type { NextConfig } from 'next';
import path from 'node:path';
import { resolveBuildId } from './src/lib/build-id';

const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    // Allow same-origin microphone and geolocation. The voice-note recorder
    // (src/components/ui/VoiceRecorder.tsx) calls getUserMedia({ audio: true }),
    // and live location sharing on the Map (src/lib/actions/live-location.ts)
    // calls navigator.geolocation — a blanket `()` denies each API before the
    // user can grant it. Both stay `(self)` so only our own origin may prompt;
    // camera stays fully denied.
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(self)',
  },
  // The Content-Security-Policy is set per-request in src/proxy.ts so it can
  // carry a fresh nonce for script-src (no 'unsafe-inline'/'unsafe-eval' in
  // production). It must NOT also be set here: two CSP headers combine
  // restrictively and would break the nonce policy.
];

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  // Stamp each build with an identifier so the client can tell when a newer
  // production build has shipped. On Vercel this is the commit SHA (or a
  // unique per-build fallback); locally it is 'dev' and the watcher stays
  // quiet. See src/lib/build-id.ts for the precedence.
  env: {
    NEXT_PUBLIC_BUILD_ID: resolveBuildId(),
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  // Same-origin reverse proxy for PostHog (client analytics + error tracking).
  // Routing ingestion and PostHog's lazily-loaded assets through our own origin
  // keeps them 'self' under the strict CSP (src/proxy.ts) and evades ad-blockers.
  // `/ingest` is excluded from the auth proxy's matcher (src/proxy.ts) so these
  // beacons never trigger a Supabase round-trip. The US assets host serves the
  // recorder/exception scripts; the API host serves the capture endpoints.
  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
    ];
  },
  // PostHog relies on trailing-slash-sensitive paths; don't auto-redirect them.
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
