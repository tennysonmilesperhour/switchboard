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
  '/design', // design direction previews
  '/api/cron',
  '/api/og',
  '/api/health',
  '/api/calendar', // token-authed personal calendar feed
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Per-request Content-Security-Policy. `script-src` is locked to a fresh nonce
 * plus `strict-dynamic`, with NO `'unsafe-inline'`/`'unsafe-eval'` in
 * production — so an injected inline script cannot execute even if an output
 * encoder is ever missed (defense in depth for the XSS class). `'unsafe-eval'`
 * is allowed only in dev, where React uses eval for error overlays.
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
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
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
    return redirectWithCsp('/welcome');
  }

  if (user && (pathname === '/welcome' || pathname === '/login')) {
    return redirectWithCsp('/');
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
