# End-to-end tests

Two tiers:

- **`public.spec.ts`** — the unauthenticated surface (welcome, login, guest-RSVP,
  no-overflow). Runs in CI with no database, and is what the default
  `npm run e2e` / the `Verify` CI job executes.
- **`authed.spec.ts` and `invite-links.spec.ts`** — the authenticated journeys
  (sign in, open the wizard, create a plan) and the host-to-recipient share-link
  contract. These need a real database, so they are **gated behind `E2E_DB=1`**
  and skipped otherwise. This keeps the default CI green while the fixtures/DB
  aren't wired.
- **`scope-board.spec.ts`** — shared checklist persistence, offline recovery,
  delayed reads/writes, and feedback visibility with an intercepted board API.
- **`client-signoff.spec.ts`** — the client's A2 report reproduced from the
  wizard's final Review step, including keyboard and pointer reordering. Runs
  only with `E2E_DB=1` against a local app and local Supabase, and never sends
  the test draft's invitations.
- **`places.spec.ts`** — Explore, the map and its layer toggles, public and
  private zones (create, search, ask to join, let in, leave), moments (check in
  and out) and boards (create, post, add a neighbour who posts and leaves).
- **`accounts.spec.ts`** — email and username sign-up through the form to
  Home, password reset from the emailed link, the legal-update funnel, and
  account deletion from Settings (after which sign-in is refused as it should
  be). Each journey makes its own throwaway account.
- **`plan-lifecycle.spec.ts`** — a cascade response window running out and the
  next person being invited, a group decision closing at its deadline, and a
  co-host using a host control. The deadline is moved into the past with the
  service role; the real cron sweep does the rest.

`support.ts` holds what the last three share: the session cache, the
service-role client for arranging state, Mailpit reads, and the cron call.

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

The places, accounts and plan-lifecycle journeys need three more things, set
the same in the shell that starts the app and the one that runs Playwright:

```bash
export CRON_SECRET=e2e-local-cron-secret            # lets a journey run the minute sweep
export RESEND_API_KEY=e2e-local-relay                # turns the app's email on…
export EMAIL_FROM='Switchboard E2E <e2e@switchboard.test>'
export RESEND_API_URL=http://127.0.0.1:54380/emails  # …and points it at the relay
```

The app sends its own mail through Resend's API, so GoTrue never puts anything
in the local Mailpit by itself. With a loopback `RESEND_API_URL`, Playwright's
global setup (`e2e/mail-relay.ts`) listens there for the run and hands each
message to Mailpit (`http://127.0.0.1:54324`, or `E2E_MAILPIT_URL`), where the
journeys read the link back. The app accepts plain http only on loopback.
Without these the journeys fail up front saying which one is missing, rather
than timing out.

## In CI

The **Authenticated E2E** job in `.github/workflows/ci.yml` does all of the
above on every PR: `supabase start`, `node e2e/seed.mjs`, build, then every
authenticated spec with `E2E_DB=1`. The job sets the four variables above at
job level, with the same test-only values, so the build, the server and the
specs agree.

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

- **Sign-in rate limit.** Sign-in allows 8 attempts per identifier per 10
  minutes. Nine journeys signing in as `e2ehost` through the form meant the
  ninth got `SB-RATE-LIMIT` instead of a session. `login()` now drives the form
  once per identifier and reuses the cookies, so the suite stops spending a
  protection that belongs to real people.

  The hard limit is now per connection: 30 sign-ins per 10 minutes and 12
  sign-ups per hour (`src/lib/server/auth-rate-limit.ts`), and every journey
  here comes from the same address. `support.ts` shares a seeded user's session
  across the run's workers, and the account journeys make fresh accounts, so a
  full authenticated run spends about 14 sign-ins and 2 sign-ups. Two runs back
  to back fit; a third inside ten minutes may meet `SB-RATE-LIMIT`. Reset the
  database, or wait, rather than raise the limit.

When you add a requirement to a flow these tests walk, add it to the fixture in
the same change — and assert it where it can say what it is.
