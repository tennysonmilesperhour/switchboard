import type { FullConfig } from '@playwright/test';

/**
 * Compile every route the no-database suites open before the first test runs.
 *
 * `next dev` compiles a route on its first request. On a loaded CI runner that
 * first compile once took more than 30 seconds (`/forgot-password`, reached by
 * clicking "Forgot password?"), longer than any assertion waits, so whichever
 * test happened to open the route first failed, while the same page answered
 * in 100 ms a minute later for the other viewport. Paying each compile here,
 * with a timeout sized for a compile rather than for a page, keeps every
 * assertion measuring the page instead of the compiler.
 *
 * A route that fails to warm is only logged: the tests that open it still run
 * and report what the page actually did.
 */
const ROUTES = [
  '/',
  '/welcome',
  '/login',
  '/forgot-password',
  '/privacy',
  '/terms',
  '/sitemap.xml',
  '/rsvp/00000000-0000-0000-0000-000000000000',
  '/i/00000000-0000-0000-0000-000000000000',
  '/scope-verification',
  '/api/scope-progress',
  '/api/scope-feedback',
  // Public routes the authenticated journeys reach from an emailed link or a
  // scheduler rather than by navigating (accounts and plan-lifecycle specs).
  // Unauthenticated, each answers without side effects: the confirm route
  // redirects to /login and the cron route refuses without its secret.
  '/reset-password',
  '/auth/confirm',
  '/api/cron/cascade',
];

const COMPILE_TIMEOUT_MS = 120_000;

export default async function warmRoutes(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  for (const route of ROUTES) {
    try {
      await fetch(new URL(route, baseURL), {
        redirect: 'manual',
        signal: AbortSignal.timeout(COMPILE_TIMEOUT_MS),
      });
    } catch (error) {
      console.warn(`[warm-routes] ${route} did not answer: ${String(error)}`);
    }
  }
}
