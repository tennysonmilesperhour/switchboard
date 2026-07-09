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

## Wiring into CI (next step)

To run these on every PR, add a job that runs `supabase start` + `supabase db
reset` + `node e2e/seed.mjs`, sets the three env vars above plus `E2E_DB=1`, and
then `npm run e2e`. Keep it a **separate, non-required** check until it's proven
stable, so it can't block merges while selectors settle. The specs were authored
against the current UI but not executed in the authoring environment (no Docker),
so the first real run may need minor selector adjustments in `authed.spec.ts`.
