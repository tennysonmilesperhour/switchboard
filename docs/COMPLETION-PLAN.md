# Completion Plan — path to a shippable v1

A hand-off backlog for finishing Switchboard. It is the output of a full
subsystem audit (July 2026). Every item cites concrete evidence (`file:line`),
a fix approach, and how to verify. Work top-down: milestones are ordered by
priority, and items inside a milestone are roughly independent.

## How to use this doc (read first)

You are picking this up cold. Before touching code:

1. Read `AGENTS.md` (this is **not** stock Next.js — check
   `node_modules/next/dist/docs/` before using an API you're unsure of) and
   `docs/SECURITY.md` (the DB is the security boundary; anything touching auth,
   RLS, `createAdminClient()`, uploads, redirects, or untrusted text has a
   precedent to follow).
2. Install and confirm the baseline is green:
   ```bash
   npm install
   npm test            # vitest — 180 tests, must stay green
   npx tsc --noEmit    # currently has 4 errors (item 3.4) — fix as you go
   npm run lint        # eslint — clean
   npm run build       # next build — succeeds
   ```
   DB invariants (needs the Supabase CLI + Docker): `supabase test db` (pgTAP).
3. Verify UI changes by driving the app, not just tests — see the `verify` /
   `run` skills if available.

### Scope exclusions (do NOT build these — deliberately deferred)

- **Google / OAuth sign-in.** Email+password is the only auth path in scope.
- **Email delivery** (Resend / `RESEND_API_KEY`).
- **SMS delivery** (Plivo / `PLIVO_*`).

The account lifecycle already works without email (admin `createUser` with
`email_confirm:true`), so these are enhancements, not blockers.

### Priority legend

- **P0** — a shipped feature is functionally broken. Fix before any launch.
- **P1** — a core flow is half-wired or a safety gap. Needed to feel finished.
- **P2** — production-readiness, test coverage, unfinished stubs.
- **P3** — polish; safe to defer past v1.

---

## Milestone 0 — Correctness bugs (P0)

Three shipped features are actually broken. These are the only true must-fixes.

### 0.1 — Poll voting is rejected in the `suggesting` and `runoff` phases
- **Problem.** Every poll is created in phase `suggesting`, and the runoff flow
  moves polls to phase `runoff`. In both, the UI shows live weight buttons but
  the server rejects every ballot, so early votes error out and **runoff mode
  collects zero input** (after having deleted the non-finalist votes).
- **Where.** `src/lib/actions/polls.ts:73` (`castVote` rejects unless
  `phase === 'voting'`) vs `src/components/polls/PollSection.tsx:100`
  (`votingOpen = phase === 'suggesting' || 'voting' || 'runoff'`, which enables
  the weight buttons at `:200`). Poll created as `suggesting` in `init.sql:212`
  and the `create_event_atomic` fn in
  `supabase/migrations/20260713120000_event_timezone.sql:136`.
- **Fix.** Decide the intended model and make the UI and action agree. Simplest:
  allow `castVote` when `phase in ('suggesting','voting','runoff')` (keep the
  `decided` rejection). The combined suggest-and-rank screen is clearly the
  design intent (host's button is "Lock suggestions", not "Open voting").
  Confirm the anonymity invariant still holds (`poll_votes` selectable only by
  author) after the change.
- **Verify.** Two-account manual test: create a plan with a poll, rate an option
  as a non-host **before** the host locks suggestions → the vote must persist,
  not toast an error. Run a runoff to completion and confirm the winner reflects
  runoff ballots. Add the regression test in item 5.3.

### 0.2 — Living-room chat renders the sender's own messages twice
- **Problem.** An optimistic message is appended with a synthetic id and never
  reconciled; the realtime INSERT then appends the same message under its real
  UUID, so the de-dupe (which compares ids) misses it. The sender sees every
  message they send twice until a hard reload.
- **Where.** `src/app/rooms/[id]/RoomClient.tsx:149` (`id: optimistic-${Date.now()}`),
  `:161` (success path only calls `router.refresh()`, never removes the
  optimistic row), `:126` (realtime handler de-dupes by `m.id === incoming.id`,
  which never matches the `optimistic-…` id). The `// Realtime will de-dupe by
  id` comment at `:147` is wrong.
- **Fix.** Reconcile on send success — e.g. drop the optimistic row when the
  realtime echo arrives (match on sender+body+approximate time, or replace the
  optimistic id once `sendMessage` returns the real row), or make `sendMessage`
  return the inserted row and swap it in. Keep the optimistic UX.
- **Verify.** Send several messages in a room with a second tab open; the sender
  must see each message exactly once, and the other member must still receive it
  once.

### 0.3 — The service worker never registers app-wide
- **Problem.** `/sw.js` is only registered inside push feature-detection, which
  early-returns `'unsupported'` when `PushManager` is absent (iOS Safari, and
  any non-push browser). So the PWA's service worker is registered only on
  push-capable browsers that mount the push UI, and **never on iOS** — offline/
  install behavior is effectively unwired, and `enablePush()`'s
  `serviceWorker.ready` can hang.
- **Where.** Only registration is `src/lib/client/push.ts:22`, gated by the
  `'PushManager' in window` check at `:19`; `enablePush()` awaits
  `navigator.serviceWorker.ready` at `:36`.
- **Fix.** Register the service worker unconditionally on load, decoupled from
  push — a small client component mounted in the root layout
  (`src/app/layout.tsx`) that calls `navigator.serviceWorker.register('/sw.js')`
  when `'serviceWorker' in navigator`. Leave push subscription separate.
- **Verify.** Load the app in a fresh browser (and iOS Safari / simulator);
  confirm the SW is `activated` in devtools and the app is installable. Confirm
  `enablePush()` still works where push is supported.

---

## Milestone 1 — Half-wired core flows (P1)

Features that exist but don't complete their loop.

### 1.1 — Shared Moments don't advance live
- **Problem.** The "open → curious → 🤝" loop only progresses if both users
  manually refresh: no realtime subscription, and `expressCuriosity` /
  `passMoment` send no notification. A **matched** moment also renders the
  "nobody else has checked in" empty state instead of linking to the room.
- **Where.** `src/app/moments/MomentsClient.tsx` (no channel/subscribe),
  `src/lib/actions/moments.ts` (`expressCuriosity`, `passMoment` send nothing;
  the match at `:181` uses `sendPushToUsers` — push-only, no durable row),
  `src/app/moments/page.tsx:34` (candidates only computed when status `open`).
- **Fix.** (a) Send a durable notification via `notifyUsers` (not
  `sendPushToUsers`) when someone becomes curious and on match — see the
  guidance in `src/lib/server/notify.ts:15`. (b) When `status === 'matched'`,
  fetch the room and render a success state linking to `/rooms/[id]`. (c)
  Optional: add a Supabase realtime subscription in `MomentsClient` for live
  candidate/curiosity updates (requires publication changes — see 1.3).
- **Verify.** Two accounts check into the same place; each sees the other appear
  and progress through consent stages without a manual refresh, gets a
  notification, and lands in the shared room on match.

### 1.2 — Mutual mode's live-match subscription is dead code
- **Problem.** `MutualClient` subscribes to `postgres_changes` on
  `mutual_intents`, but that table was never added to the `supabase_realtime`
  publication, so the callback never fires. Degrades to manual refresh today.
- **Where.** `src/app/mutual/MutualClient.tsx:85-107`; no `alter publication
  supabase_realtime add table … mutual_intents` in any migration.
- **Fix.** Either add `public.mutual_intents` to the `supabase_realtime`
  publication in a migration (mind the RLS: the subscription is filtered by
  `author_id`, so a subscriber only receives their own rows — confirm that holds
  and doesn't leak the counterpart's unrequited interest), **or** switch the
  subscription to the already-published `matches` table.
- **Verify.** Two accounts express mutual intent; the second sees the match
  appear live.

### 1.3 — Room auto-filed items and chat don't live-update for others
- **Problem.** `room_items` is not in the realtime publication and
  `RoomClient` only subscribes to `messages`, so tabs (addresses/tasks/links)
  populated by one member don't appear for others until reload.
- **Where.** `src/app/rooms/[id]/RoomClient.tsx` (subscribes to `messages`
  only); no publication entry for `room_items`.
- **Fix.** Add `public.room_items` to `supabase_realtime` and subscribe to it in
  `RoomClient`, mirroring the messages channel. (Coordinate with 1.1/1.2 — do
  the publication changes in one migration.)
- **Verify.** Two members in a room; an address one pastes files into the tab
  for the other live.

### 1.4 — Guests can RSVP but can't add the event to their calendar
- **Problem.** The guest "You're in" state offers no calendar affordance, though
  the host-facing ICS/feed exist.
- **Where.** `src/app/rsvp/[token]/GuestRsvpClient.tsx` (accepted state, ~`:48`).
  Per-event ICS at `src/app/api/events/[id]/ics/route.ts` uses the RLS client
  and `/api/events` is not a public prefix in `src/proxy.ts`.
- **Fix.** Add "Add to calendar" to the accepted state — either a Google
  Calendar template URL (`googleCalendarUrl` already exists in
  `src/lib/calendar-links.ts`) or a token-scoped public ICS endpoint for that
  invite (do not expose the RLS-gated per-event route to anon).
- **Verify.** Accept as a guest (no account) and get a working calendar add.

### 1.5 — Onboarding is not enforced app-wide
- **Problem.** The "are you onboarded" gate lives only on the home route, so an
  authenticated-but-not-onboarded user who lands on any other path (e.g. an
  invite deep link with `?next=`) skips onboarding entirely — no interests, no
  starter circles.
- **Where.** Gate exists only at `src/app/page.tsx:33` and
  `src/app/onboarding/page.tsx:34`; there is no `src/middleware.ts`;
  `src/lib/server/require-user.ts` checks auth only.
- **Fix.** Add a shared server gate (middleware or a helper used by protected
  layouts) that redirects authenticated users with `onboarded=false` to
  `/onboarding`, preserving the intended destination. Mind the excluded auth
  routes and public prefixes in `src/proxy.ts`.
- **Verify.** Sign in with a not-onboarded account via a deep link → you land on
  `/onboarding`, and after finishing, continue to the original destination.

---

## Milestone 2 — Moderation & safety (P1)

The single biggest structural hole for a product handling private contacts.

### 2.1 — Build the moderation review path
- **Problem.** Users can file reports and block, but there's no operator review
  queue and no way to action a report. `user_reports` rows are readable only by
  the reporter (RLS `user_reports_own_select`), so no moderator can triage them
  in-app. Reporting/blocking is also not reachable from several surfaces where
  you'd actually meet a bad actor.
- **Where.** `reportProfile` → `src/lib/actions/connections.ts:323`;
  RLS in `supabase/migrations/20260708120000_launch_hardening.sql:199`.
  Existing precedent for gated roles: board moderators via `is_board_moderator`.
- **Fix.** This is a real feature, follow `docs/SECURITY.md` precedents:
  (a) an operator/moderator capability that is **not** a self-writable column
  (separate table or security-definer-gated), (b) a review surface that lists
  open `user_reports` with the reported context and resolve/dismiss actions
  (writes via `createAdminClient()` that re-authorize the specific moderator),
  (c) surface "Report / Block" from profile cards, room members, moment reveals,
  and connection requests. Add pgTAP coverage for the new policies.
- **Verify.** As a non-moderator you cannot read others' reports; as a moderator
  you can triage and resolve; blocking is reachable from every people surface
  and is enforced (it already gates discovery/matching/etc.).

---

## Milestone 3 — Deploy & production readiness (P1–P2)

### 3.1 — The every-minute cron needs a Vercel Pro plan (P1)
- **Problem.** `vercel.json` schedules `/api/cron/cascade` at `* * * * *`, but
  Vercel Hobby caps cron at **once per day**. On a free deploy nothing
  time-based (cascade advancement guarantee, poll deadline resolution, reminders)
  fires reliably. Lazy on-page-load advancement still works.
- **Fix.** Document the Pro requirement in `docs/DEPLOYMENT.md`, or move the
  sweep to an external scheduler (GitHub Actions cron / Upstash / cron-job.org)
  hitting the endpoint with the `CRON_SECRET` bearer. Also add
  `export const maxDuration` / `runtime` to the route and batch/limit the sweeps
  (`sweepCascades` in `src/lib/server/cascade-runner.ts:165` scans all `sent`
  invites sequentially) so it stays within the function timeout at scale.
- **Verify.** Confirm the chosen scheduler actually invokes the endpoint and it
  returns `{ ok: true }` within the timeout.

### 3.2 — PWA / metadata gaps (P2)
- **No `apple-touch-icon`** → iOS home-screen install shows a page screenshot.
  `src/app/layout.tsx:23` sets `appleWebApp.capable` but no apple icon. Add
  `src/app/apple-icon.png` (or `metadata.icons.apple`).
- **No `metadataBase`** → relative `og:image` URLs (e.g.
  `src/app/events/[id]/page.tsx:73`, `src/app/rsvp/[token]/page.tsx:39`) resolve
  to the wrong origin for link unfurls. Set `metadata.metadataBase` from
  `NEXT_PUBLIC_APP_URL` in the root layout.
- **No `global-error.tsx`** → an error thrown by the root layout renders Next's
  unstyled default. `src/app/error.tsx` exists but can't catch root-layout
  errors. Add `src/app/global-error.tsx`.
- **No `robots` / `sitemap`** → add `src/app/robots.ts` and
  `src/app/sitemap.ts` (index public/marketing/legal routes, disallow app
  routes).
- **`theme_color` mismatch** → `src/app/manifest.ts:11` (`#f7f3ea`) vs
  `src/app/layout.tsx:31` viewport `themeColor` (`#f9fbfd`). Reconcile.
- **Verify.** Lighthouse PWA / installability audit passes; iOS "Add to Home
  Screen" shows the real icon; a shared event link unfurls with the OG image.

### 3.3 — Guard the OG image route (P2)
- **Problem.** `src/app/api/og/event/[id]/route.tsx:13` calls
  `createAdminClient()` with no `hasAdminCredentials()` guard, unlike the
  calendar feed (503) and RSVP page. Harmless today (the URL is only emitted
  when creds exist) but inconsistent.
- **Fix.** Add the same guard for consistency and safe degradation.

### 3.4 — Get `tsc --noEmit` green and add typecheck to CI (P2)
- **Problem.** 4 type errors in `src/lib/build-id.test.ts` (missing `NODE_ENV`
  on the `ProcessEnv` stubs). Invisible to `npm test` (vitest doesn't typecheck)
  and to `next build` (test files aren't in the build), so CI never catches
  them. CI (`.github/workflows/ci.yml`) runs lint/test/build/playwright but no
  `tsc`.
- **Fix.** Fix the stubs, then add an `npx tsc --noEmit` step to `ci.yml`.
- **Verify.** `npx tsc --noEmit` exits clean; CI includes the typecheck step.

### 3.5 — Add a data-retention / cleanup job (P2)
- **Problem.** No scheduled cleanup; expired `availability_signals`, stale
  moments, old rate-limit rows, etc. are only read-filtered and accumulate.
- **Fix.** Add a sweep (fold into the cron route or a second scheduled task)
  that deletes expired/stale rows on a sensible cadence.

---

## Milestone 4 — Finish or remove unfinished stubs & dead schema (P2)

Each of these is either wired-with-no-UI or UI-with-no-effect. Decide **finish**
or **remove** per item; leaving them signals an unfinished app.

- **4.1 Operator "Soon" toggles.** `capacity_guard` and `tune_windows` are
  shown disabled with "Not wired up yet" (`src/app/you/OperatorSettings.tsx:36,43`).
  Implement the behaviors or remove the rows.
- **4.2 Poll `vote_deadline`.** The cron sweep resolves polls by deadline
  (`src/lib/server/poll-runner.ts:63`) but no UI ever sets one (`EventWizard`
  hardcodes `null`). Add a deadline picker or drop the sweep branch.
- **4.3 Poll `suggest_deadline`.** Column + type field exist (`init.sql:215`,
  `types.ts:226`) but are never written or read. Wire a suggesting→voting
  auto-advance or remove the column/field.
- **4.4 Event end time.** `EventWizard` submits `endsAt: null` unconditionally
  (`src/app/events/new/EventWizard.tsx:597`); only editable post-create.
  `create_event_atomic` already accepts `endsAt`. Add an optional end-time field.
- **4.5 `reminders_enabled` toggle.** Column honored by `dueReminders` but has no
  control in the wizard/settings. Add a toggle or drop it.
- **4.6 Board post "First date".** Captured into `board_posts.starts_at`
  (`src/lib/actions/boards.ts:123`) but never rendered
  (`BoardClient.tsx:216` captures, render block omits it). Display it.
- **4.7 Board "Recurring event" kind** is inert bulletin text, not a real event
  (`src/app/boards/page.tsx:42`, `BoardClient.tsx:160`). Either generate a real
  recurring event or relabel as an announcement.
- **4.8 Board growth.** Members can only be added by exact handle of an existing
  user (`inviteToBoard`, `boards.ts:62`). Add a shareable board invite link.
- **4.9 Zones empty state.** `src/app/zones/page.tsx:46` shows nothing but the
  create form when there are zero zones. Add an empty-state card (boards has one
  to copy).
- **4.10 Unused venue/zone fields.** `venues.url`, `zones.starts_at/ends_at` are
  in the schema but never collected or shown. Collect+display or drop.

---

## Milestone 5 — Test coverage & seed (P2)

### 5.1 — Make the authenticated e2e suite actually run
- **Problem.** All authed tests are gated behind `E2E_DB=1`
  (`e2e/authed.spec.ts:9`), which CI never sets — so only ~7 public tests run.
  The one "create a plan" test also uses **stale selectors**
  (`e2e/authed.spec.ts:55` looks for placeholders the wizard no longer has:
  now `Name (optional)` / `@username, email, or phone`).
- **Fix.** Fix the selectors, and either wire the DB-backed suite into CI (spin
  up Supabase + set `E2E_DB=1`) or split it into a job that runs on a schedule.
- **Verify.** The create-a-plan e2e passes and runs in CI.

### 5.2 — Make the seed produce a demoable app
- **Problem.** `scripts/seed-test-profiles.mjs` / `e2e/seed.mjs` set
  `onboarded:true` but never set `discoverable` (defaults `false`,
  `20260709140000_discovery_matching.sql`), so discovery/people/mutual render
  empty even after seeding.
- **Fix.** Set `discoverable:true` on seeded profiles and seed some
  events/zones/venues so the content surfaces demo non-empty.

### 5.3 — Fill the critical-flow test gaps
Add coverage (unit + pgTAP + e2e as appropriate) for the flows that currently
have none — several of these would have caught the P0 bugs:
- Poll runner, `castVote` phase gate, and runoff lifecycle (guards item 0.1).
- Mutual `check_mutual_match` trigger and moment consent staging (pgTAP).
- Auth/onboarding server actions (`createPasswordAccount`,
  `signInWithPasswordIdentifier`, `completeOnboarding`, `requestPasswordReset`,
  `updatePassword`) and a create-account→onboard e2e.
- Guest RSVP happy path (`respondToGuestInvite`) and the calendar-feed dedupe.
- AI no-key fallbacks: `extractWithRules` (`src/lib/ai/extract.ts:46`),
  `fallbackSuggestions` (`discovery.ts:48`), `parseWithRules`
  (`plan-parser.ts:42`).
- Connections / profile-edit / account-deletion actions.

---

## Milestone 6 — Polish (P3)

- **6.1** Welcome page: show a "Your account was deleted" banner when
  `?account=deleted` (`deleteAccount` redirects there; `welcome/page.tsx`
  ignores it).
- **6.2** Login: read the `reason` param and show an "expired reset link" message
  linking to `/forgot-password` (`auth/confirm/route.ts:32` sends it;
  `login/page.tsx:34` ignores it).
- **6.3** Reset-password: check for a recovery session up front and show an
  "open your reset link first" state instead of only failing on submit.
- **6.4** Moment rooms are mislabeled "Group" in the rooms list — add a
  `'moment'` case at `src/app/rooms/page.tsx:62`.
- **6.5** Rooms empty-state promises "photos quietly organize themselves"
  (`rooms/page.tsx:45`) but there's no photo-send path though `RoomItemKind`
  includes `'photo'`. Implement photo messages or soften the copy.
- **6.6** Missing `loading.tsx` for `/you`, `/settings`, `/u/[handle]`, `/zones`
  (they do server queries and inherit a mismatched root skeleton).
- **6.7** `/events` has no index page (bare `/events` 404s — nothing links to it;
  `/plans` is canonical). Add an index or accept it.
- **6.8** `/design` is an orphan design-system route, unlinked but publicly
  reachable (already `robots: noindex`). Consider gating to non-production.
- **6.9** Copyright page tells users to "contact the operator" with no channel
  (`src/app/copyright/page.tsx:27`). Add a real contact.
- **6.10** Discover: no section heading on the Explore page; `Suggestion.category`
  is produced but never shown; import-failure copy promises a "blank plan" that
  never appears (`src/lib/actions/import.ts:66`). Small copy/markup fixes.
- **6.11** Plan-parser no-key fallback drops date/time and always uses mode
  `individual` — optional lightweight regex for weekday/time and a keyword→mode
  heuristic.

---

## Out of scope for v1 (note, don't build now)

- Client-side runtime error capture (server `reportOperationalError` exists;
  the client boundary reports nothing to any sink).
- Product analytics / activation instrumentation (none today).
- Internationalization (English-only, `<html lang="en">` hardcoded).
- The excluded integrations: Google OAuth, email, SMS.

---

## Suggested execution order

1. **PR 1 — P0 bugs:** items 0.1, 0.2, 0.3 + their regression tests (5.3 subset).
   Small, high-value, independently shippable.
2. **PR 2 — realtime/publication + half-wired flows:** 1.1–1.5 (do the
   `supabase_realtime` publication changes once, in one migration).
3. **PR 3 — moderation:** 2.1 (largest; follow `docs/SECURITY.md`).
4. **PR 4 — deploy readiness:** milestone 3.
5. **PR 5 — finish/remove stubs:** milestone 4.
6. **PR 6 — tests & seed:** milestone 5.
7. **PR 7+ — polish:** milestone 6, as capacity allows.

Keep `npm test`, `npm run lint`, `npm run build`, `npx tsc --noEmit`, and
`supabase test db` green on every PR; add coverage for each new surface.
