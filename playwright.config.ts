import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // The authenticated journeys walk a multi-step wizard, so a genuine failure
  // needs room to report itself rather than being cut off as a timeout.
  timeout: 60_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    // `on-first-retry` keeps nothing when a run has no retries, which is how a
    // red suite can stay unexplained. Keep a trace and a screenshot for any
    // test that fails, so the first red run already carries its own evidence.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  /**
   * Assertions wait longer than Playwright's 5s default because the very first
   * hit of a route pays for a cold start. Five seconds was tuned against a warm
   * local dev server and was the reason CI failures read as "element not found"
   * — a missing heading and a slow one are indistinguishable at the timeout,
   * which sent every investigation looking for a UI bug that wasn't there.
   */
  expect: { timeout: 15_000 },
  /**
   * In CI, also emit a machine-readable report so the workflow can print a
   * compact "what failed and why" at the very end of the job.
   *
   * The list reporter puts the failure near the middle of a long log, ahead of
   * artifact upload and cleanup chatter, and a failed page assertion drags a
   * page snapshot and a source excerpt in with it. Reading a red run then means
   * paging back through hundreds of lines for the one sentence that matters —
   * which is how the last three investigations here started.
   */
  reporter: process.env.CI
    ? [['list'], ['json', { outputFile: 'playwright-report/results.json' }]]
    : 'list',
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        /**
         * Local runs default to the dev server — it's already running, and
         * `reuseExistingServer` picks it up. CI sets this to `npm run start`
         * and builds first: `next dev` compiles each route on demand, on the
         * first request, so in CI the test suite was effectively timing the
         * compiler. Under a loaded runner that made every authenticated
         * journey fail at once, for no reason a diff could explain.
         */
        command: process.env.PLAYWRIGHT_WEB_SERVER ?? 'npm run dev',
        url: 'http://localhost:3000/welcome',
        reuseExistingServer: true,
        timeout: 120_000,
        /**
         * Show the server's own account of the run. Playwright swallows the web
         * server's output by default, which meant every server-side cause —
         * a `reportOperationalError` line, an action that threw, a failed query
         * — was thrown away at the exact moment a red suite needed it. The
         * `permission denied for function is_event_host` that had this suite red
         * for two weeks was found by reading these lines; they should not have
         * needed a one-off workflow edit to see.
         */
        stdout: 'pipe',
        stderr: 'pipe',
      },
});
