/**
 * The identifier stamped into each build so a running client can tell when a
 * newer production build has shipped (see VersionWatcher + /api/version).
 *
 * Precedence:
 *   1. VERCEL_GIT_COMMIT_SHA - stable per commit, present for git deploys at
 *      both build and runtime; ideal.
 *   2. VERCEL_DEPLOYMENT_ID - unique per deployment; covers redeploys of the
 *      same commit.
 *   3. On Vercel with neither (e.g. a CLI deploy without git metadata), fall
 *      back to a per-build timestamp so the id is still unique - never 'dev',
 *      which would silently disable the version watcher in production.
 *   4. Local dev: 'dev', which keeps the watcher quiet (nothing to compare).
 *
 * Evaluated once at build time and inlined (via next.config `env`) into both
 * the client bundle and the /api/version route, so both sides always compare
 * the same value.
 */
export function resolveBuildId(env: NodeJS.ProcessEnv = process.env): string {
  if (env.VERCEL_GIT_COMMIT_SHA) return env.VERCEL_GIT_COMMIT_SHA;
  if (env.VERCEL_DEPLOYMENT_ID) return env.VERCEL_DEPLOYMENT_ID;
  if (env.VERCEL) return `build-${Date.now()}`;
  return 'dev';
}
