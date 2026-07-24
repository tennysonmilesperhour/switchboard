/**
 * Every outbound link Switchboard puts in front of a human is built here.
 *
 * Before this module there were three ways to build one — `appUrl()` in
 * server/email.ts, a raw `process.env.NEXT_PUBLIC_APP_URL ?? ''` in
 * actions/boards.ts, and `window.location.origin` in ShareButton — and two of
 * them could emit a link that is broken the moment it leaves the app:
 *
 *   - `?? ''` degrades to a bare path (`/boards/join/abc`), which is not a URL
 *     at all once it is pasted into a text message.
 *   - `window.location.origin` stamps the link with whatever host the *sender*
 *     happened to be on: a `*.vercel.app` preview (which sits behind deployment
 *     protection and 401s for the recipient), a `www.` variant, or a PWA pinned
 *     to a retired domain.
 *
 * So: one origin, validated, no silent fallbacks. A link that cannot be built
 * correctly must fail on the sender's side, where someone can fix it — never
 * arrive broken on the recipient's.
 */

/** Shape of a usable public origin: absolute, http(s), host only, no path. */
function parseOrigin(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // e.g. "switchboardsocial.me" with no scheme
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!url.hostname) return null;
  // A configured origin with a path, query, or fragment silently corrupts every
  // link built from it (`https://host/app` + `/rsvp/x` -> `https://host/app/rsvp/x`
  // is fine, but `https://host/?utm=1` + `/rsvp/x` is not). Reject rather than guess.
  if (url.search || url.hash) return null;
  if (url.pathname !== '/' && url.pathname !== '') return null;
  return url.origin;
}

const DEV_FALLBACK = 'http://localhost:3000';

/**
 * The app's canonical public origin (no trailing slash).
 *
 * Throws in production when `NEXT_PUBLIC_APP_URL` is missing or malformed. That
 * is deliberate: a misconfigured origin is not a degraded experience, it is
 * every invitation going out dead, and the failure needs to surface at send
 * time rather than in a recipient's messages app.
 */
export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!configured) {
    if (isProduction) {
      throw new Error('NEXT_PUBLIC_APP_URL must be configured in production');
    }
    return DEV_FALLBACK;
  }

  const origin = parseOrigin(configured.trim());
  if (!origin) {
    if (isProduction) {
      throw new Error(
        'NEXT_PUBLIC_APP_URL must be an absolute origin such as ' +
          'https://switchboardsocial.me (scheme required, no path or query)',
      );
    }
    return DEV_FALLBACK;
  }
  return origin;
}

/** Absolute URL for an app-relative path. `path` must start with `/`. */
export function absoluteUrl(path = ''): string {
  if (path && !path.startsWith('/')) {
    throw new Error(`absoluteUrl expects an app-relative path, got: ${path}`);
  }
  return `${appOrigin()}${path}`;
}

// ————————————————————————— the link contract —————————————————————————
// Every share surface routes through one of these. If you are adding a new way
// to hand someone a link, add it here and cover it in e2e/public.spec.ts —
// that test opens each of these signed out and asserts the plan renders.

/** App-relative path for a plan's public share link. */
export function eventSharePath(shareToken: string): string {
  return `/i/${shareToken}`;
}

/**
 * The one link to give a human for a plan: public, unguessable, works signed
 * out, no account needed. This is what every Share/Copy affordance emits.
 */
export function eventShareUrl(shareToken: string): string {
  return absoluteUrl(eventSharePath(shareToken));
}

/** A specific person's RSVP link (per-invite capability token). */
export function guestRsvpUrl(guestToken: string): string {
  return absoluteUrl(`/rsvp/${guestToken}`);
}

/** A board's shareable join link. */
export function boardJoinUrl(code: string): string {
  return absoluteUrl(`/boards/join/${encodeURIComponent(code)}`);
}
