/**
 * The per-request Content-Security-Policy.
 *
 * Lives here rather than in `src/proxy.ts` because Next's proxy file "must
 * export a single function" (see the proxy file convention in Next's docs), so
 * the policy could not otherwise be reached by a test — and this is a header
 * whose failures are invisible. A CSP violation is a console line in someone
 * else's browser: nothing throws, no request 500s, no log records it. The
 * `connect-src` below was wrong for over a month and the only evidence was a
 * message in a CI browser nobody was reading.
 */

import { mapConnectSources, mapStyleConfig } from '@/lib/geo';

/**
 * Where the browser may reach Supabase — the REST origin and its websocket.
 *
 * Read from `NEXT_PUBLIC_SUPABASE_URL` rather than hardcoded to
 * `*.supabase.co`, which was wrong in both directions. Too wide in production:
 * the wildcard authorises every Supabase project on the internet, not ours.
 * Too narrow everywhere the database isn't on that domain — a local stack and
 * CI both serve it from `127.0.0.1:54321`, where the realtime socket was
 * refused on every page that opens one. So live consensus on a poll, the
 * notification bell, and every other subscription have never worked outside a
 * deployed environment, and the E2E suite has been asserting against an app
 * with realtime switched off.
 *
 * PostHog needs no entry — its ingestion is reverse-proxied through `/ingest`
 * and is already covered by `'self'`.
 *
 * The wildcard remains only as a fallback for a build with no Supabase URL
 * configured, which has larger problems than its CSP.
 */
export function supabaseConnectSources(
  configured = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  if (configured) {
    try {
      const { origin, protocol, host } = new URL(configured);
      return `${origin} ${protocol === 'http:' ? 'ws' : 'wss'}://${host}`;
    } catch {
      // Fall through to the wildcard rather than emit a broken directive.
    }
  }
  return 'https://*.supabase.co wss://*.supabase.co';
}

/**
 * Where stored media is served from: the Supabase origin alone, without the
 * websocket. Images already allow any https source, so this only adds the
 * local stack's http origin there; audio has no such allowance, and without
 * a `media-src` every signed voice-note URL fell back to `default-src 'self'`
 * and was refused, in production too.
 */
export function supabaseMediaSource(
  configured = process.env.NEXT_PUBLIC_SUPABASE_URL,
): string {
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Fall through to the wildcard rather than emit a broken directive.
    }
  }
  return 'https://*.supabase.co';
}

/**
 * Where the browser fetches the basemap: the style JSON, vector tiles, glyphs
 * and sprites all come over `fetch`, so the map is blank without these origins.
 */
export function mapSources(
  light = process.env.NEXT_PUBLIC_MAP_STYLE_URL,
  dark = process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK,
): string {
  return mapConnectSources(mapStyleConfig(light, dark));
}

/**
 * `script-src` uses a fresh nonce for inline framework scripts and same-origin
 * bundles, with NO `'unsafe-inline'` in production. We intentionally avoid
 * `strict-dynamic`: Next/Turbopack can request follow-up chunks without a
 * nonce, and strict-dynamic causes browsers to ignore the `'self'` allow-list
 * for those scripts.
 *
 * `'unsafe-eval'` is allowed only in dev, where React uses eval for overlays.
 *
 * `style-src` intentionally keeps `'unsafe-inline'`: inline `style={{…}}`
 * attributes are pervasive in the UI and a CSP nonce does not cover inline
 * style *attributes* (only `<style>` elements). Style injection is far lower
 * risk than script injection, so this is an accepted allowance.
 *
 * `worker-src blob:` is for the map: MapLibre parses vector tiles in a Web
 * Worker it builds from a blob of its own bundled code. Without it the worker
 * falls back to `script-src`, is refused, and the map never draws a tile.
 */
export function buildCsp(
  nonce: string,
  options: { isDev?: boolean; supabaseUrl?: string; mapSources?: string } = {},
): string {
  const isDev = options.isDev ?? process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https: ${supabaseMediaSource(options.supabaseUrl)}`,
    `media-src 'self' blob: ${supabaseMediaSource(options.supabaseUrl)}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseConnectSources(options.supabaseUrl)} ${options.mapSources ?? mapSources()}`,
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}
