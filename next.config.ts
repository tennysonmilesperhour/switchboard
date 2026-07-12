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
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=()',
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
};

export default nextConfig;
