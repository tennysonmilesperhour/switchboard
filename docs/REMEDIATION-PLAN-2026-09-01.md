# Remediation plan, 2026-09-01

The work order that follows from [`AUDIT-2026-09-01.md`](AUDIT-2026-09-01.md).
The audit has the evidence and the file:line citations; this file has the
work, in the order it should be done, written so a session with no other
context can pick up any item and finish it.

## How to work this file

- **One pull request per numbered item.** Small, reviewable, mergeable on its
  own. Do not bundle items. Do not widen an item beyond what its acceptance
  criteria need.
- **Before touching anything, read `AGENTS.md`.** Then read
  `docs/SECURITY.md` before items that touch auth, RLS, the admin client, or
  untrusted input, and `docs/AUTH.md` before items that touch sign-in,
  sign-up, or recovery. Their rules are enforced by tests and the tests will
  fail you if you skip them.
- **Every item ships with its test.** Security items get a pgTAP file under
  `supabase/tests/` (run with `supabase test db`, needs Docker). Everything
  else gets a vitest file beside the code (`npm test`). An item without its
  test is not done.
- **Run the checks a contributor runs before pushing:**
  `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, and for
  anything under `supabase/`, `supabase test db`.
- **Docs move in the same PR.** If an item changes behaviour that a living doc
  describes (`SECURITY.md`, `AUTH.md`, `DEPLOYMENT.md`, `features.ts`), update
  the doc in the same PR.
- **Error messages.** Any new operational failure needs a code from
  `src/lib/errors.ts` via `failure()` or `reportAndFail()`. Validation does
  not. `operator` failures have `fix: null`.
- **Naming.** Plan, not event. Explore, not Discover. Room, not Living Room.
  See `docs/NAMING.md`.
- **Mark items done here.** Change the leading `[ ]` to `[x]` and add the PR
  number, in the same PR that finishes the item.

## Owner tasks (need a dashboard, not code)

These block or de-risk the code work. Do them first or in parallel.

- [ ] **GitHub Actions spending limit.** Every workflow failed in about three
  seconds with no logs from 2026-08-29 until the September 1 minutes reset.
  Raise the limit or set a monthly budget so it does not recur on the 29th.
- [ ] **Confirm the production database.** Compare the Supabase project ref in
  the GitHub secret `SUPABASE_PROJECT_ID` (the integration links to
  `cuzgighqdzypntmhxrqc`) against the host in Vercel's
  `NEXT_PUBLIC_SUPABASE_URL`. They must be the same project.
- [ ] **Say what was run by hand.** Between 2026-08-31 19:52 UTC and
  2026-09-01 18:08 UTC, `profiles.notify_plans` appeared in production without
  the deploy workflow running. Whoever did it should record what they ran, so
  item 2 below can assert the right columns.
- [ ] **Configure Resend and Twilio** (`RESEND_API_KEY`, `EMAIL_FROM`, the
  four Twilio vars). Until then, guest invites by email and SMS do nothing and
  the cold-start path is inert.
- [ ] **Enable leaked-password protection** in Supabase Auth (still the last
  open security advisor per `DOCKET.md`).

---

## Pass 1: stop the bleeding

Target: two working days. Everything here is small and each item is a
production defect or an exploitable gap today.

### 1. Deploys can no longer outrun their schema

- [x] **What.** The app auto-deploys on push to `main` while the migration
  workflow runs in parallel with no lock and no gate. Code that reads new
  columns goes live before, or without, the columns. Completed in
  [#161](https://github.com/tennysonmilesperhour/switchboard/pull/161).
- **Where.** `.github/workflows/deploy-migrations.yml`, `vercel.json`,
  `docs/DEPLOYMENT.md`.
- **How.**
  1. Add to the workflow: `concurrency: { group: db-push, cancel-in-progress: false }`
     and `environment: production` on the job.
  2. Turn off Vercel's Git auto-deploy for `main` (Vercel project settings,
     or `"git": { "deploymentEnabled": { "main": false } }` in `vercel.json`).
  3. Add a final workflow step that fires a Vercel deploy hook only after the
     parity step passes. Store the hook URL as a GitHub secret.
  4. Document the new flow and the rollback procedure (Supabase PITR or a
     forward migration) in `DEPLOYMENT.md`. Remove the phantom
     `SUPABASE_DB_PASSWORD` row.
- **Accept.** A push to `main` produces exactly one production deploy, and it
  happens after the migration job succeeds. `DEPLOYMENT.md` describes it.

### 2. Schema drift becomes visible

- [ ] **What.** `/api/health` pins `EXPECTED_SCHEMA_VERSION = '20260731201812'`
  and `app_schema_status()` enumerates versions only through July 31; eighteen
  migrations have shipped since. The parity step compares migration filenames
  to a history table, so a migration recorded as applied without its DDL is
  invisible. This already happened.
- **Where.** `src/app/api/health/route.ts`, a new migration redefining
  `app_schema_status()`, `src/lib/health.test.ts` (new).
- **How.**
  1. Rewrite `app_schema_status()` to check that specific tables and columns
     exist via `information_schema` (start with `profiles.notify_plans`,
     `profiles.appearance_custom`, `profiles.digest_hour`,
     `calendar_subscriptions`, `calendar_busy`, `match_dismissals`,
     `event_availability`, `parental_approvals`) and return the missing list.
  2. Health reports `schema: false` with the missing names when the list is
     non-empty.
  3. Keep the version pin but add a unit test that reads
     `ls supabase/migrations | tail -1` and fails when it is newer than the
     constant, so the constant cannot silently lapse again.
  4. Add a pgTAP test that the function returns an empty missing list on a
     fully migrated database.
- **Accept.** Dropping any listed column on a local stack makes `/api/health`
  report it by name. Adding a migration without bumping the constant fails
  `npm test`.

### 3. Security H1: parental approval is bound to the caller

- [x] **What.** `requestParentalApproval` never checks that the invite belongs
  to the caller or the named event; a youth can approve themselves and
  pre-empt the real guardian; any account can email arbitrary addresses.
  Fixed in PR #163.
- **Where.** `src/lib/actions/parental-approval.ts:22-104`,
  `resolve_parental_approval` in
  `supabase/migrations/20260811120000_parental_approval.sql`, new migration,
  `supabase/tests/parental_approval_authz.test.sql` (new).
- **How.**
  1. Load the invite through the caller's own RLS client and require
     `invite.invitee_id === user.id && invite.event_id === input.eventId`
     before any admin write. Return `failure('SB-…')` otherwise (add the code).
  2. In the RPC, assert `v_invite.event_id = v_approval.event_id`.
  3. Rate-limit the request per user with `checkRateLimit`.
  4. Let the host, not only the invitee, trigger a resend, so the "already
     sent" refusal cannot be used to lock out the real guardian.
- **Accept.** pgTAP: a user who is not the invitee cannot create an approval
  for that invite; an approval whose event does not match its invite does not
  resolve. Unit test for the action's refusal path.

### 4. Security H2: live location cannot be trilaterated

- [x] **What.** `distance_m` is computed from raw coordinates while lat/lng
  are rounded to three decimals; three spoofed caller positions recover a
  sharer to the metre. Fixed in PR #164.
- **Where.** `supabase/migrations/20260718120000_live_location.sql:87-105`
  (redefine in a new migration), `supabase/tests/live_location.test.sql`.
- **How.** Compute `distance_m` from the already-rounded coordinates, or
  return a bucket (`under_500m`, `about_1km`, `over_1km`) instead of a number.
  Update `src/lib/actions/live-location.ts` and the map UI to the new shape.
- **Accept.** pgTAP asserts that two sharers whose raw positions differ by
  less than the rounding grid get identical `distance_m` values.

### 5. Security H3: moments reveal nobody before consent

- [x] **What.** `src/app/moments/page.tsx:70-112` ships every candidate's
  `user_id` regardless of stage, `find_shared_moments` applies no block
  filter, and `expressCuriosity` pings any owner. Fixed in PR #165.
- **Where.** `src/app/moments/page.tsx`, `src/app/moments/MomentsClient.tsx`,
  `src/lib/actions/moments.ts`, new migration redefining
  `find_shared_moments`, `supabase/tests/moments_anonymity.test.sql` (new).
- **How.**
  1. Only include `userId` on a candidate once its stage is `revealed` or
     `accepted`. Block and report on an unrevealed candidate go through a
     server action that takes the moment id and resolves the owner server-side.
  2. Add `and not public.are_blocked(auth.uid(), m.user_id)` to
     `find_shared_moments`.
  3. Re-check blocks in `expressCuriosity` and `acceptMoment`.
- **Accept.** pgTAP: a blocked user does not appear in the other's candidates
  in either direction. Unit test: the page's candidate payload has no
  `userId` for an `open` or `curious` moment.

### 6. Security H4: invites honour blocks and hosts cannot forge attendance

- [x] **What.** `create_event_atomic` and `addPeopleToEvent` apply no
  `are_blocked` check and no invitee cap; `deliverInvitations` and
  `cancelEvent` send host text to any `guest_contact`; the `invites_insert`
  policy lets a host insert `status = 'accepted'` for any profile. Fixed in
  PR #166.
- **Where.** `src/lib/actions/events.ts:393-567`, `private.create_event_atomic`
  (latest definition is in `20260811120000_parental_approval.sql`), the
  `invites_insert` policy from `20260710123000_cohost_policy_parity.sql`,
  `src/lib/server/cascade-runner.ts`, `supabase/tests/invite_blocks.test.sql`
  (new).
- **How.**
  1. In `create_event_atomic` and `addPeopleToEvent`, reject any `profileId`
     where `are_blocked(host, profileId)`; `inviteConnectionNow` already does
     this at `events.ts:617`, reuse that shape.
  2. Cap invitees per plan (a constant, say 100) and add a per-host daily limit
     on outbound email and SMS through `checkRateLimit`.
  3. Replace the `invites_insert` policy with one that also requires
     `status in ('queued', 'sent')`, or add a trigger that rejects other
     statuses on insert.
- **Accept.** pgTAP: a host cannot insert an `accepted` invite; a blocked
  profile id is rejected by `create_event_atomic`. Unit test for the cap.

### 7. Front door: create account, signal bar, contrast

- [x] **What.** Three user-visible defects on the first screens. Fixed in
  PR #167.
- **Where and how.**
  1. `src/app/welcome/page.tsx:67,111,117`: the "Create account" links must
     carry `mode=create` (build the href the way `RsvpSignInGate.tsx:39` does).
     Add a Playwright assertion in `e2e/public.spec.ts` that the create tab is
     open after clicking it.
  2. `src/components/signals/SignalBar.tsx:96-112`: delete `promptLocationOnce`
     and its call. It requests geolocation and discards the result.
  3. `src/app/globals.css` and `src/lib/themes-app.test.ts:137-166`: raise
     these pairs to at least 4.5:1 in the default theme: `ink-faint` on paper,
     `terracotta` link text (use `terracotta-deep`), white on `sage` (the
     "I'm in" button), `rose-deep` on `rose-soft` (error banners), white on
     `plan-jade` and `plan-orange` card titles. Then extend the test's pair
     list to cover button text on every button variant, link colour on paper,
     badge text on badge fill, and the bottom-nav label colour. Every preset
     must pass the widened list.
- **Accept.** New user lands on the create tab. No permission prompt on
  "I'm free". `themes-app.test.ts` covers the six pairs and passes.

### 8. Three one-liners

*Fixed in PR #168.*

- [x] **Digest cron.** Add `{ "path": "/api/cron/digest", "schedule": "0 * * * *" }`
  to `vercel.json`. Mention it in `docs/DEPLOYMENT.md`.
- [x] **Legal re-acceptance.** Set `LEGAL_VERSION` in `src/lib/legal.ts` to
  `'2026-08-31'` to match the effective date on `/privacy` and `/terms`, so
  the SMS clause is re-accepted.
- [x] **Moderators can delete their accounts.** New migration:
  `alter table user_reports alter column resolved_by ... on delete set null`
  and the same for `venues.reviewed_by` (drop and re-add the FK constraints).
  Add a pgTAP test that deletes a user who has rows in every FK-bearing
  table and expects success.

---

## Pass 2: make it hold

Target: one to two weeks. These turn the audit's recurring bug classes into
compile errors or test failures.

### 9. Generated database types

- [ ] **What.** No `Database` type; `src/lib/types.ts` is a hand mirror that
  is stale by three tables and six `profiles` columns; 31 row casts paper over
  it. The audit's production outage is the third bug from this class.
- **How.**
  1. `supabase gen types typescript --local > src/lib/supabase/database.types.ts`.
  2. Thread `<Database>` into `createServerClient`, `createBrowserClient`, and
     the admin client.
  3. Fix the call sites the compiler now rejects; delete the row casts as you
     go. Retire the schema-mirroring parts of `src/lib/types.ts`.
  4. Add a CI step to `ci.yml` that regenerates the file and fails on diff.
- **Accept.** `tsc` passes with the generic threaded through; CI fails if a
  migration lands without regenerated types.

### 10. Error registry everywhere

- [ ] **What.** 23 of 35 action files never use `failure()` or
  `reportAndFail()`; 164 codeless `{ ok: false }` returns; `errors.test.ts`
  only scans `reportOperationalError` areas so it cannot see this.
- **How.**
  1. Extend `src/lib/errors.test.ts` to flag any `return { ok: false` in
     `src/lib/actions` whose string is not a validation message (maintain a
     short allowlist of validation phrasings, or require validation returns to
     use a `validation()` helper).
  2. Work through the 23 files. Start with `updateNotificationPrefs` in
     `profile.ts` (the one failing in production), then `identity.ts`,
     `connections.ts`, `boards.ts`, `calendar-sync.ts`, `rooms.ts`,
     `moments.ts`, `zones.ts`.
  3. While there, replace the 26 raw `getUser()` preambles with
     `requireUser()` and settle on one signed-out return shape.
- **Accept.** The extended test passes; no action returns a codeless
  operational failure.

### 11. Outbound calls have timeouts and bounds

- [ ] **What.** Resend and Twilio `fetch` with no `AbortSignal`; the Anthropic
  client has no `timeout`; fan-out is unbounded `Promise.all`; message send
  awaits the extraction model call.
- **Where.** `src/lib/server/email.ts:63`, `src/lib/server/sms.ts:45`,
  `src/lib/ai/claude.ts`, `src/lib/actions/rooms.ts:46-62`.
- **How.** `AbortSignal.timeout(10_000)` on both provider fetches; `timeout`
  and `maxRetries` on the Anthropic client; a small batching helper (five at
  a time) for `sendEmails` and `sendSmsMessages`; move `extractItems` in
  `sendMessage` into `after()` so the send returns as soon as the row is
  inserted.
- **Accept.** Unit tests with a stalled fetch mock prove each path rejects
  within the timeout. Message send returns before extraction runs.

### 12. Cron heartbeat and overlap guard

- [ ] **What.** Nothing records that a sweep ran; five sweeps can overlap;
  sweeps are sequential under a 60 second cap and die silently at scale.
- **Where.** `src/app/api/cron/cascade/route.ts`, `src/app/api/cron/digest/route.ts`,
  `src/lib/server/cascade-runner.ts`, `src/app/api/health/route.ts`.
- **How.** Take `pg_try_advisory_lock` at the start of each sweep and exit
  if held; write `last_run_at` and counts to `operator_settings` at the end;
  have health report `cron: false` when the cascade heartbeat is older than
  five minutes; log the summary line, not only return it.
- **Accept.** Health goes red on a local stack when the cron is not called for
  five minutes. Two concurrent sweep calls result in one doing work.

### 13. The e2e suite that matters runs in CI

- [ ] **What.** `e2e/invite-links.spec.ts` guards the repo's most repeated
  regression class and is not run by the authenticated CI job.
- **Where.** `.github/workflows/ci.yml:136`.
- **How.** Change the run step to `npx playwright test e2e/authed.spec.ts e2e/invite-links.spec.ts`.
  Then add vitest coverage, using the mocking pattern in
  `src/lib/actions/invites.test.ts`, for `events.ts` (`cancelEvent`,
  `deleteEventPermanently`, `addPeopleToEvent`), `connections.ts`
  (`giveSpace`, `blockProfile`), `zones.ts`, `parental-approval.ts`, and the
  `uploads/*` and `cron/*` route handlers. Delete the four exported actions
  nothing calls (`setEventInviteLink`, `toggleParentalApproval`,
  `removeFollowUpPoll`, `isOfferedSlot`).
- **Accept.** CI runs both specs; each named module has a test file.

### 14. Security M1 to M7

- [ ] **M1.** Revoke `execute` on `digest_items(uuid)` from `authenticated`
  (`20260818160000_daily_digest.sql:66`); add it to
  `service_role_grants.test.sql`.
- [ ] **M2.** Revoke `authenticated` execute on the pair oracles
  (`are_blocked`, `are_connected`, `is_event_host`, `is_board_member`,
  `is_board_moderator`, `is_room_member`, `is_zone_member`,
  `is_zone_moderator`, `can_view_event`, `can_view_zone`,
  `is_platform_moderator`). Policies and definers keep working; any
  TypeScript caller (`events.ts:617` uses `are_blocked`) moves to a wrapper
  that takes no user argument and uses `auth.uid()`.
- [ ] **M3.** Move the 10 per hour throttle into `resolve_profile_contact`
  itself via `consume_rate_limit` keyed on `auth.uid()`.
- [ ] **M4.** In `src/lib/actions/auth.ts:419-452`, resolve the reset and
  resend targets through `auth.users.email` (admin `listUsers` filtered by
  email, or `getUserByEmail`) and never through `profiles.contact_email`.
  Add the case to the blocked-account table in `auth.test.ts`.
- [ ] **M5.** `checkRateLimit('ai:discovery:<user>')`, `ai:plan`, and
  `ai:extract` on the three unlimited model calls.
- [ ] **M6.** Add an IP dimension (`x-forwarded-for`) to sign-in and sign-up
  limits alongside the identifier key, with a higher per-identifier ceiling
  and backoff instead of a hard lock.
- [ ] **M7.** In `src/lib/server/media.ts:40-43`, parse with `new URL()` and
  require `origin === new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin`.
- [ ] **Rate limiter fails closed** for auth and upload keys
  (`src/lib/server/rate-limit.ts:9-22`); page via `reportOperationalError`
  when the RPC errors.
- **Accept.** Each item has a pgTAP or vitest assertion; `SECURITY.md` §9
  matches what the code does.

### 15. SMS opt-out that exists

- [ ] **What.** The terms describe STOP/HELP handling; there is no inbound
  webhook, no opt-out record, and non-users get texted.
- **How.** `POST /api/sms/inbound` validating Twilio's signature; an
  `sms_opt_outs` table keyed by normalised number; `sendSmsWithResult`
  refuses opted-out numbers; only text guests whose invite was explicitly
  sent by SMS. Add `List-Unsubscribe` to guest emails while there.
- **Accept.** A STOP reply results in no further sends to that number; unit
  test on the send guard; pgTAP on the table's RLS.

### 16. Dialogs, loading, offline

- [ ] `src/components/ui/ConfirmDialog.tsx`: move focus in on open, close on
  Escape, `aria-labelledby` the title, return focus on close. Then extract one
  `Dialog`/`Sheet` primitive with a focus trap and `inert` on the background,
  and migrate the other three hand-rolled overlays (More sheet, InviteeSheet,
  ProfileShare, PlaceSearch).
- [ ] `loading.tsx` for `/settings`, `/you`, `/zones`, `/map`, `/features`,
  `/u/[handle]`, `/create`, `/events/new`, `/profile/edit`, using
  `PageSkeleton`.
- [ ] `public/sw.js`: an offline page instead of falling back to `/welcome`.
- [ ] One bottom-overlay slot: `InstallPrompt`, `PmfSurvey`, and
  `NotificationNudge` never render at once; the notification nudge waits until
  the user has sent or received an invite.
- [ ] Dismiss buttons reach 44px; `viewport.themeColor` follows the active
  theme; `prefers-color-scheme: dark` selects Dusk when no theme is saved.
- **Accept.** Keyboard-only walk through delete-plan and delete-account works;
  no route flashes blank; offline shows a real offline page.

---

## Pass 3: make it clean

Target: this quarter. These are the product and structure decisions.

### 17. Home shows one thing

- [ ] **What.** Up to thirteen stacked sections; "Waiting on you" renders
  tenth; four equal pillars by design.
- **Where.** `src/app/page.tsx`, `src/components/home/PillarRow.tsx`.
- **How.** Order: greeting, "Waiting on you", plan feed, one guidance card,
  then the pillars. Delete the "Make something happen" grid. Change the
  subtitle from "Feeling social? Let people know." to something that does not
  ask for a broadcast. Give Mutual, Your Read, and Zones a one-paragraph
  first-run explanation on their own empty pages.
- **Accept.** An invited user sees their invitation above the fold on a 390px
  viewport. Update `features.ts` `where` strings.

### 18. Density gate for the serendipity surfaces

- [ ] **What.** Zones, moments, live map, and boards are empty rooms for a
  user with no graph and no city. The docket calls the plans loop the wedge.
- **How.** One "Around" entry in the More sheet that opens map, zones, and
  moments as tabs. Show it on Home only when the viewer's city has at least
  one anchored zone or one other sharer. Signals default audience becomes the
  last-used circle, never "everyone", when the user has circles.
- **Accept.** New user with zero connections sees Make a plan, People, and
  Plans as the only pillars.

### 19. Split the four oversized files

- [ ] `src/app/events/new/EventWizard.tsx` (2,046 lines): one file per step
  under `src/app/events/new/steps/`, a thin shell that owns state.
- [ ] `src/lib/actions/events.ts` (1,605 lines): `events-lifecycle.ts`,
  `event-invitees.ts`, `event-cohosts.ts`, `event-share-links.ts`. Every
  `createAdminClient()` site goes through `checkEventManager`; remove the 13
  ad-hoc `host_id === user.id` checks named in the audit.
- [ ] `src/app/events/[id]/page.tsx` (1,256 lines): a `loadEventPage(id, user)`
  loader in `src/lib/server/` with the ~20 independent reads in two
  `Promise.all` phases. Same treatment for `settings/page.tsx`.
- [ ] `src/app/people/PeopleClient.tsx` (1,104 lines): one component per
  section.
- [ ] Indexes: `events (host_id, status)`, `events (status) where status = 'inviting'`,
  `push_subscriptions (user_id)`, `poll_votes (poll_id)`.
- [ ] Add `import 'server-only'` to `supabase/admin.ts`, `ai/claude.ts`,
  `server/email.ts`, `server/sms.ts`, `server/notify.ts`, `server/secret.ts`,
  and a `no-restricted-imports` ESLint rule fencing `@/lib/supabase/admin`
  out of `src/components/**` and `*Client.tsx`.
- [ ] Fold `src/app/join/[id]/page.tsx:169` into `share-link.ts` and add a
  `hostCanEditInvitees(status)` helper so the six repeated status literals go
  away. Extend `share-link.test.ts` to grep for the literal outside the module.
- **Accept.** No source file over 800 lines except registries; event page
  TTFB measurably lower; the new lint rule passes.

### 20. One catalogue, honest docs

- [ ] `src/lib/features.ts` is the only list of what ships. README's feature
  table becomes a pointer; `docs/INNOVATIONS.md` drops the seven ideas that
  are built (Run it back, co-hosts, split the bill, heatmap, calendar sync,
  sabbatical, boards) and its "none are built yet" line;
  `public/scope-verification.js` and `/scope-verification` leave the app
  bundle (move the checklist to `docs/archive/`).
- [ ] Fix the five docket contradictions named in the audit §8 (geolocation,
  live people on the map, Google free/busy, the plan-parser fallback,
  `suggest_deadline`). Delete the stale "Needs Docker" line. Archive
  `WEEKLY-PLAN-2026-08-11.md` with a banner. Index `POSTHOG_SOURCEMAPS.md`.
  Move `AUDIT-2026-09-01.md` and this file to `archive/` once every box here
  is ticked.
- [ ] Resolve the five `docs/NAMING.md` decide rows in one PR: Explore on the
  Home tile (`page.tsx:442`); short `metadata.title` for Mutual, Zones,
  Moments; one name for the create button; "invite link" everywhere;
  "Serendipity" only on first introduction. Replace "event" with "plan" and
  "cascade" with plain words in the strings the audit lists.
- [ ] Remove `/design` from the bundle (it 404s in production). Remove the
  `migrate:legacy-media` and `backfill:guest-invites` npm scripts and move the
  scripts to `scripts/archive/`. Move `leaflet` to `dependencies`. Add
  `tsconfig.tsbuildinfo` to `.gitignore`.
- **Accept.** `features.test.ts` still passes; no doc claims something the
  code contradicts; `docs/README.md` indexes every file in `docs/`.

### 21. Retention, deletion, export

- [ ] Extend `src/lib/server/cleanup.ts` to delete
  `contact_verification_requests` past `expires_at`, `rate_limits` older than
  a day, read `notifications` older than 90 days, closed `moments` older than
  30 days. Coarsen `live_locations` at write, not read.
- [ ] On account deletion, remove the user's storage objects (avatars, covers,
  room photos, voice notes) before `auth.admin.deleteUser`, so `/privacy`'s
  promise is true.
- [ ] A `exportMyData` action producing a JSON download of the caller's
  profile, plans, RSVPs, messages, and signals.
- [ ] Dedupe the observability webhook by `area + code` with a 60 second
  window. Log web-push failures other than 404 and 410 through
  `reportOperationalError`. Upload PostHog source maps per
  `docs/POSTHOG_SOURCEMAPS.md`. `Cache-Control: public, s-maxage=3600` on
  `/api/og/event/[id]`.
- **Accept.** pgTAP for the sweeps' scope; a deleted account leaves no
  storage objects on a local stack; export returns valid JSON.

---

## Done when

Every box above is ticked with a PR number, `AUDIT-2026-09-01.md` and this
file have moved to `docs/archive/` with banners, and the open items that
remain (if any) are listed in `DOCKET.md`.
