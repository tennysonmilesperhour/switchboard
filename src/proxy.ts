import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTH_BOUNCE_COOKIE,
  AUTH_BOUNCE_MAX_AGE_SECONDS,
  authLandingAction,
  isAuthLandingPath,
} from '@/lib/auth-bounce';
import { LEGAL_VERSION } from '@/lib/legal';
import { buildCsp } from '@/lib/csp';
import { failure } from '@/lib/errors';
import { isSuspendedAuthError, isSuspendedUser, SUSPENDED_LOGIN_ERROR } from '@/lib/suspension';

/** Paths reachable without a session. */
const PUBLIC_PREFIXES = [
  '/welcome',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/privacy',
  '/terms',
  '/sms-compliance',
  '/community',
  '/copyright',
  '/auth',
  '/rsvp', // guest RSVP links
  '/i', // public per-plan share links (the one a host texts); token-authed
  '/join', // shareable plan links; auth returns here via a validated next path
  '/approve', // guardian approval links; token-authed, the guardian has no account
  '/verify-contact',
  '/verify-fact', // emailed fact-verification link; the page sends a signed-out visitor to sign in and back
  '/scope-verification', // client-facing checklist, shared by URL; nothing private on it
  '/api/scope-feedback', // the checklist's feedback box; the client has no account by design
  '/api/scope-progress', // the checklist's shared board, readable by anyone with the link
  '/api/sms/inbound',
  '/api/sms/status', // Twilio signature-authenticated; never redirect to browser login
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
 * A programmatic request to an API route, as opposed to someone following an
 * API link in the browser (the calendar download), who is better served by the
 * sign-in redirect than by a JSON body.
 */
function isApiCall(request: NextRequest): boolean {
  return (
    request.nextUrl.pathname.startsWith('/api/') &&
    request.headers.get('sec-fetch-mode') !== 'navigate'
  );
}

export async function proxy(request: NextRequest) {
  // Vercel cron invokes the deployment hostname and does not follow redirects.
  // These JSON endpoints authenticate their own CRON_SECRET; browser
  // canonicalization and session refresh must not intercept the scheduler.
  if (
    ['/api/cron/cascade', '/api/cron/digest', '/api/cron/external-events']
      .includes(request.nextUrl.pathname)
  ) {
    return NextResponse.next();
  }

  // Keep one canonical origin in production. This makes old bookmarks and
  // shared invite links converge before auth/session cookies are evaluated,
  // while leaving local development and Vercel preview URLs usable.
  if (
    process.env.VERCEL_ENV === 'production' &&
    request.nextUrl.hostname !== 'switchboardsocial.me'
  ) {
    const url = request.nextUrl.clone();
    url.protocol = 'https:';
    url.hostname = 'switchboardsocial.me';
    url.port = '';
    return NextResponse.redirect(url, 308);
  }

  // Fresh, unguessable nonce per request. It rides the REQUEST headers so
  // Next.js can extract it and stamp its framework/bundle <script> tags, and
  // the CSP rides the RESPONSE so the browser enforces it. Rebuilt on each
  // NextResponse.next so Supabase cookie refreshes keep both.
  //
  // Nonce-CSP pages must not be CDN-cached: no s-maxage, no ISR. This proxy
  // runs before the cache and issues a new nonce on every request, while a
  // cached document still carries the previous one. The browser then blocks
  // the inline scripts, including the ones signup needs. /welcome stays
  // dynamic and uncached for that reason.
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
    error: userError,
  } = await supabase.auth.getUser();
  // The auth server answers a suspended account's session with `user_banned`
  // and no user, so a suspension is read from the error as well as the user.
  const suspended = isSuspendedAuthError(userError) || (user !== null && isSuspendedUser(user));

  // A session issued before a moderator suspended the account. Sign-in already
  // names a suspension (SB-AUTH-SUSPENDED); a page load on a live session is
  // signed out and sent to that same sentence, with its route out, instead of
  // carrying on inside the app (docs/AUTH.md). A Server Action sent from a tab
  // that was already open passes through and `requireUser` refuses it with the
  // same code: answering a POST with a redirect hands it an HTML page it
  // cannot read.
  if (suspended && !request.headers.has('next-action')) {
    if (isApiCall(request)) {
      const res = NextResponse.json(failure('SB-AUTH-SUSPENDED'), { status: 403 });
      res.headers.set('content-security-policy', csp);
      return res;
    }
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    if (
      pathname === '/login' &&
      request.nextUrl.searchParams.get('error') === SUSPENDED_LOGIN_ERROR
    ) {
      return response;
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('error', SUSPENDED_LOGIN_ERROR);
    const res = NextResponse.redirect(url);
    res.headers.set('content-security-policy', csp);
    // Carry the cleared session cookies, so the sign-in page renders signed out.
    for (const cookie of response.cookies.getAll()) res.cookies.set(cookie);
    return res;
  }

  // Only a Server Action from a suspended session gets here. The auth server
  // gave it no user, so the signed-out rules below would answer it with a
  // redirect it cannot read; let it through for requireUser to refuse by name.
  if (suspended) return response;

  if (!user && !isPublicPath(pathname) && isApiCall(request)) {
    // A fetch() follows a redirect silently, so sending an expired session's
    // upload or push POST to /welcome hands the caller a 200 HTML page it reads
    // as success or as a network fault. Answer in the route's own contract.
    const res = NextResponse.json(failure('SB-AUTH-EXPIRED'), { status: 401 });
    res.headers.set('content-security-policy', csp);
    return res;
  }

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

  if (user && isAuthLandingPath(pathname)) {
    // A protected page decides "signed out" with its own getUser(), and this
    // rule decides "signed in" with ours. When the two disagree they redirect
    // at each other forever: the browser keeps the previous document painted,
    // so a user who just submitted the login form watches "Signing in..." spin
    // with no error — see src/lib/auth-bounce.ts. Bounce once; if the browser
    // comes straight back, the session we can see is not one the pages can
    // use, so drop it and let them sign in cleanly instead of looping.
    // Releasing only stops the redirect; it deliberately does NOT clear the
    // session. A signed-in visitor can reach this path innocently (the /login
    // header links to /welcome), and signing them out for navigating would be a
    // worse bug than the one being fixed. Rendering is enough to break the
    // loop — a fresh sign-in overwrites the stale cookies anyway.
    const alreadyBounced = Boolean(request.cookies.get(AUTH_BOUNCE_COOKIE));
    if (authLandingAction(alreadyBounced) === 'release') {
      const res = nextWithCsp();
      res.cookies.delete(AUTH_BOUNCE_COOKIE);
      return res;
    }

    const res = redirectWithCsp('/');
    res.cookies.set(AUTH_BOUNCE_COOKIE, '1', {
      maxAge: AUTH_BOUNCE_MAX_AGE_SECONDS,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return res;
  }

  // Reaching any other route means the bounce resolved, so retire the marker
  // rather than letting it shadow a later, healthy sign-in.
  if (request.cookies.get(AUTH_BOUNCE_COOKIE)) {
    response.cookies.delete(AUTH_BOUNCE_COOKIE);
  }

  // Funnel authenticated-but-not-onboarded users into onboarding from ANY
  // protected route, not just the home page — otherwise an invite deep link
  // (?next=/join/…) or any bookmarked path lets a user in without a profile,
  // interests, or starter circles. Invite pages remain public to signed-out
  // visitors, but signed-in visitors must finish setup before answering.
  // Actions enforce eligibility in their database transaction, not a redirect.
  if (
    user &&
    (!isPublicPath(pathname) || /^\/(i|join|rsvp)(\/|$)/.test(pathname)) &&
    pathname !== '/onboarding' &&
    !(request.headers.has('next-action') && /^\/(i|join|rsvp)(\/|$)/.test(pathname)) &&
    !pathname.startsWith('/api/')
  ) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarded, legal_terms_version')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || profile.onboarded !== true) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      url.search = '';
      if (pathname !== '/') url.searchParams.set('next', pathname + request.nextUrl.search);
      const res = NextResponse.redirect(url);
      res.headers.set('content-security-policy', csp);
      return res;
    }
    if (
      profile?.onboarded === true &&
      profile.legal_terms_version !== LEGAL_VERSION &&
      pathname !== '/legal-update'
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/legal-update';
      url.search = '';
      if (pathname !== '/') url.searchParams.set('next', pathname + request.nextUrl.search);
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
    '/((?!ingest|_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|offline.html|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
