# End-to-end tests

Two tiers:

- **`public.spec.ts`** — the unauthenticated surface (welcome, login, guest-RSVP,
  no-overflow). Runs in CI with no database, and is what the default
  `npm run e2e` / the `Verify` CI job executes.
- **`authed.spec.ts`** — the authenticated journeys (sign in, open the wizard,
  create a plan). These need a real database, so they are **gated behind
  `E2E_DB=1`** and skipped otherwise. This keeps the default CI green while the
  fixtures/DB aren't wired.

## Running the authenticated tests locally

1. Start a local Supabase and apply the migrations:
   ```bash
   supabase init      # one-time, if there's no supabase/config.toml yet
   supabase start
   supabase db reset  # applies everything in supabase/migrations/ to local
   ```
2. Point the app and seed at local Supabase (values printed by `supabase start`):
   ```bash
   export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
   export NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from supabase start>
   export SUPABASE_SERVICE_ROLE_KEY=<service_role key from supabase start>
   ```
3. Seed the fixture users (host + guest, connected):
   ```bash
   node e2e/seed.mjs
   ```
4. Run the app and the gated tests:
   ```bash
   E2E_DB=1 npm run e2e     # Playwright starts `npm run dev` itself
   ```

## In CI

The **Authenticated E2E** job in `.github/workflows/ci.yml` does all of the
above on every PR: `supabase start`, `node e2e/seed.mjs`, build, then
`npx playwright test e2e/authed.spec.ts` with `E2E_DB=1`.

## Fixtures owe the product its rules

These journeys drive the real app, so a product rule the fixture doesn't satisfy
takes the whole suite down — and never at the rule. Twice now:

- **Legal version.** `src/proxy.ts` funnels an onboarded user whose accepted
  terms version is stale to `/legal-update`, which renders with no app shell.
  Every authenticated journey then failed on "element not found". `seed.mjs`
  now parses `LEGAL_VERSION` out of the source so a bump can't strand it again.
- **Invite context.** A plan may not leave the wizard's Basics step without a
  location or a detail (`hasInviteDetails`). A fixture that filled only the
  title left Next disabled, and five journeys failed inside a shared helper
  with "expected enabled, received disabled". `startPlan()` now fills the
  context and asserts the gate by name where it's set.

When you add a requirement to a flow these tests walk, add it to the fixture in
the same change — and assert it where it can say what it is.
