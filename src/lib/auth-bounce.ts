/**
 * Loop-breaking for the two auth checks that can disagree.
 *
 * `src/proxy.ts` sends a visitor who *looks* signed in away from `/login` and
 * `/welcome` and into the app. Every protected page (src/app/page.tsx,
 * src/app/onboarding/page.tsx, …) does the opposite: a visitor who does *not*
 * look signed in is sent back to `/welcome` or `/login`.
 *
 * Those two rules point at each other, so they only stay stable while both
 * reads agree. They can legitimately disagree: `src/lib/supabase/server.ts`
 * swallows cookie writes during a Server Component render (Next.js forbids
 * them), so a refresh-token rotation the proxy persisted is not guaranteed to
 * be visible to the page render that follows it. When they disagree the browser
 * redirects forever — and because a pending navigation keeps the *previous*
 * document painted, a user who just submitted the login form sees "Signing
 * in..." spin indefinitely with no error. That is the failure this module
 * exists to stop.
 */

/** Marks that we already sent a signed-in-looking browser inward once. */
export const AUTH_BOUNCE_COOKIE = 'sb-auth-bounce';

/** How long the marker lives. Long enough for one redirect, short enough to
 *  never affect a later, healthy sign-in. */
export const AUTH_BOUNCE_MAX_AGE_SECONDS = 10;

/** The public auth pages the proxy redirects an authenticated visitor off. */
export function isAuthLandingPath(pathname: string): boolean {
  return pathname === '/welcome' || pathname === '/login';
}

/**
 * What the proxy should do when it sees a session on an auth landing page.
 *
 * - `bounce`  — first arrival: send them into the app, as before.
 * - `release` — we already bounced this browser and it came straight back, so
 *   the page-level check disagrees with ours. Render the auth page instead of
 *   redirecting again, or the two rules loop until the browser gives up.
 */
export function authLandingAction(alreadyBounced: boolean): 'bounce' | 'release' {
  return alreadyBounced ? 'release' : 'bounce';
}
