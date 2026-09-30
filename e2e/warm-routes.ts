import { chromium, type FullConfig } from '@playwright/test';

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
 * Server Actions compile on their first call, not with their page, and a GET
 * cannot reach one. The first failed sign-in in a run once took 8.1 seconds of
 * compile, just past the sign-in form's own 8-second guard, so the form
 * correctly said "Sign-in took too long" where the test expected the wrong-
 * password message. `warmSignInAction` makes that first call here instead.
 *
 * Anything that fails to warm is only logged: the tests that open it still run
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
  await warmSignInAction(config, baseURL);
}

/**
 * Submit one sign-in with an identifier that can't exist, the same input the
 * smoke test uses. The action rejects its format before asking the auth
 * server, so this touches no account and no database.
 */
async function warmSignInAction(config: FullConfig, baseURL: string): Promise<void> {
  // Launch Chromium the way the config's Chromium project does.
  const chromiumProject = config.projects.find(
    (project) => (project.use?.defaultBrowserType ?? project.use?.browserName ?? 'chromium') === 'chromium',
  );
  const browser = await chromium
    .launch(chromiumProject?.use?.launchOptions)
    .catch((error: unknown) => {
      console.warn(`[warm-routes] sign-in action not warmed, no browser: ${String(error)}`);
      return null;
    });
  if (!browser) return;
  try {
    const page = await browser.newPage();
    await page.goto(new URL('/login', baseURL).toString(), { timeout: COMPILE_TIMEOUT_MS });
    await page.getByLabel('Email or username').fill('invalid!');
    await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
    const answered = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/login',
      { timeout: COMPILE_TIMEOUT_MS },
    );
    await page.locator('form').getByRole('button', { name: 'Sign in', exact: true }).click();
    await answered;
  } catch (error) {
    console.warn(`[warm-routes] sign-in action did not answer: ${String(error)}`);
  } finally {
    await browser.close();
  }
}
