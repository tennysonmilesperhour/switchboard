import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = [
  '/welcome',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/terms',
  '/community',
  '/copyright',
  '/auth',
  '/rsvp', // guest RSVP links
  '/join', // shareable plan links; auth returns here via a validated next path
  '/verify-contact',
  '/design', // design direction previews
  '/api/cron',
  '/api/og',
  '/api/health',
  '/api/version',
  '/api/calendar', // token-authed personal calendar feed
  '/robots.txt',
  '/sitemap.xml',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Per-request Content-Security-Policy. `script-src` uses a fresh nonce for
 * inline framework scripts and same-origin bundles, with NO `'unsafe-inline'`
 * in production. We intentionally avoid `strict-dynamic`: Next/Turbopack can
 * request follow-up chunks without a nonce, and strict-dynamic causes browsers
 * to ignore the `'self'` allow-list for those scripts.
 *
 * `'unsafe-eval'` is allowed only in dev, where React uses eval for overlays.
 *
 * `style-src` intentionally keeps `'unsafe-inline'`: inline `style={{…}}`
 * attributes are pervasive in the UI and a CSP nonce does not cover inline
 * style *attributes* (only `<style>` elements). Style injection is far lower
 * risk than script injection, so this is an accepted allowance.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  // Fresh, unguessable nonce per request. It rides the REQUEST headers so
  // Next.js can extract it and stamp its framework/bundle <script> tags, and
  // the CSP rides the RESPONSE so the browser enforces it. Rebuilt on each
  // NextResponse.next so Supabase cookie refreshes keep both.
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  const { pathname } = request.nextUrl;

  const nextWithCsp = () => {
    const headers = new Headers(request.headers);
    headers.set('x-nonce', nonce);
    headers.set('content-security-policy', csp);
    const res = NextResponse.next({ request: { headers } });
    res.headers.set('content-security-policy', csp);
    return res;
  };

  const redirectWithCsp = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    const res = NextResponse.redirect(url);
    res.headers.set('content-security-policy', csp);
    return res;
  };

  let response = nextWithCsp();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isPublicPath(pathname)) return response;
    return redirectWithCsp('/welcome');
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Rebuild from the now-updated request so refreshed cookies AND the
          // nonce/CSP both survive.
          response = nextWithCsp();
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the session (required for SSR auth) and read the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(pathname)) {
    // Preserve the intended deep link so signing in returns the visitor right
    // back here — a shared /events/… link, a bookmarked route — instead of
    // stranding them on the landing page. /welcome forwards this to its auth
    // links and /login validates it (safeNextPath) before redirecting.
    const url = request.nextUrl.clone();
    url.pathname = '/welcome';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', pathname);
    const res = NextResponse.redirect(url);
    res.headers.set('content-security-policy', csp);
    return res;
  }

  if (user && (pathname === '/welcome' || pathname === '/login')) {
    return redirectWithCsp('/');
  }

  // Funnel authenticated-but-not-onboarded users into onboarding from ANY
  // protected route, not just the home page — otherwise an invite deep link
  // (?next=/join/…) or any bookmarked path lets a user in without a profile,
  // interests, or starter circles. Public routes and API routes are exempt (a
  // signed-out guest can still view a share/RSVP link, and API calls must not
  // be redirected to an HTML page).
  if (
    user &&
    !isPublicPath(pathname) &&
    pathname !== '/onboarding' &&
    !pathname.startsWith('/api/')
  ) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarded')
      .eq('id', user.id)
      .maybeSingle();
    if (profile && profile.onboarded === false) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.search = '';
      if (pathname !== '/') url.searchParams.set('next', pathname);
      const res = NextResponse.redirect(url);
      res.headers.set('content-security-policy', csp);
      return res;
    }
  }

  return response;
}

export const config = {
  matcher: [
    // `ingest` is the same-origin PostHog reverse proxy (see next.config.ts).
    // Excluding it here keeps analytics/error beacons off the auth path — no
    // Supabase round-trip, no redirect for signed-out users hitting /ingest.
    '/((?!ingest|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
