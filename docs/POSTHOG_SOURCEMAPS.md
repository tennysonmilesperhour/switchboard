# PostHog source maps (make minified exceptions readable)

Client exceptions reach PostHog error tracking minified. A React #418 issue, for
example, showed a stack of `rX / rG / sh` frames inside
`_next/static/chunks/<hash>.js` with no file or line, so the offending component
had to be inferred rather than read. Uploading source maps at build time lets
PostHog symbolicate those stacks back to real files and lines.

The build integration is wired through `@posthog/nextjs-config`. It activates
only when both build-time credentials are present; a personal key is not the
public `phc_…` ingest key and must never ship to the browser.

## 1. Build integration

`next.config.ts` wraps the existing config only when the credentials are
present. With them absent (local dev and PRs from forks), the normal config is
exported and no upload is attempted:

```ts
import { withPostHogConfig } from '@posthog/nextjs-config';

// ...existing `const nextConfig: NextConfig = { ... }`...

const PH_API_KEY = process.env.POSTHOG_API_KEY;   // personal key (phx_…), secret
const PH_PROJECT_ID = process.env.POSTHOG_PROJECT_ID;
const buildId = resolveBuildId();

export default PH_API_KEY && PH_PROJECT_ID
  ? withPostHogConfig(nextConfig, {
      personalApiKey: PH_API_KEY,
      projectId: PH_PROJECT_ID,
      host: 'https://us.posthog.com',
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
        releaseName: 'switchboard',
        releaseVersion: buildId,
      },
    })
  : nextConfig;
```

`projectId` and the `release*` names are the current
`@posthog/nextjs-config@1.11.0` options; the older `envId`, `project`, and
`version` names are deprecated.

## 2. Provision the build credentials (Vercel)

Create a **personal API key** in PostHog (Settings → Personal API keys) scoped to
error tracking / source map upload, then add both as Production env vars:

- `POSTHOG_API_KEY` = the `phx_…` personal key (mark as secret / sensitive)
- `POSTHOG_PROJECT_ID` = `376510` (this project's id)

They are read only at build time on the server, never `NEXT_PUBLIC_`, so they
never reach the client — consistent with the secret-handling rule in AGENTS.md.

## 3. Verify

After the next production deploy, a fresh client exception should show real file
names and line numbers in PostHog instead of hashed chunk frames. Confirm the
build log shows the PostHog "uploaded N source maps" step.

Reference: PostHog docs → Error tracking → Uploading source maps (Next.js).
The integration deletes local `.map` files after a successful upload so source
is symbolicated in PostHog without being served with the production assets.
