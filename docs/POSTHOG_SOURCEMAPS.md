# PostHog source maps (make minified exceptions readable)

Client exceptions reach PostHog error tracking minified. A React #418 issue, for
example, showed a stack of `rX / rG / sh` frames inside
`_next/static/chunks/<hash>.js` with no file or line, so the offending component
had to be inferred rather than read. Uploading source maps at build time lets
PostHog symbolicate those stacks back to real files and lines.

This is not wired up yet because it needs a **PostHog personal API key** stored
as a deployment secret (a personal key is not the public `phc_…` ingest key and
must never ship to the browser). Steps to enable:

## 1. Add the dependency

```bash
npm install --save-dev @posthog/nextjs-config
```

## 2. Wrap the Next config (guarded)

In `next.config.ts`, wrap the existing export so the upload only runs when the
credentials are present. With the env vars absent (local dev, PRs from forks),
the build is byte-for-byte what it is today, so this can never break CI:

```ts
import { withPostHogConfig } from '@posthog/nextjs-config';

// ...existing `const nextConfig: NextConfig = { ... }`...

const PH_API_KEY = process.env.POSTHOG_API_KEY;   // personal key (phx_…), secret
const PH_ENV_ID = process.env.POSTHOG_ENV_ID;     // project/env id, e.g. 376510

export default PH_API_KEY && PH_ENV_ID
  ? withPostHogConfig(nextConfig, {
      personalApiKey: PH_API_KEY,
      envId: PH_ENV_ID,
      host: 'https://us.posthog.com',
      sourcemaps: { enabled: true },
    })
  : nextConfig;
```

## 3. Provision the secrets (Vercel)

Create a **personal API key** in PostHog (Settings → Personal API keys) scoped to
error tracking / source map upload, then add both as Production env vars:

- `POSTHOG_API_KEY` = the `phx_…` personal key (mark as secret / sensitive)
- `POSTHOG_ENV_ID` = `376510` (this project's id)

They are read only at build time on the server, never `NEXT_PUBLIC_`, so they
never reach the client — consistent with the secret-handling rule in AGENTS.md.

## 4. Verify

After the next production deploy, a fresh client exception should show real file
names and line numbers in PostHog instead of hashed chunk frames. Confirm the
build log shows the PostHog "uploaded N source maps" step.

Reference: PostHog docs → Error tracking → Uploading source maps (Next.js).
Confirm the exact `withPostHogConfig` option names against the installed
package version before relying on them.
