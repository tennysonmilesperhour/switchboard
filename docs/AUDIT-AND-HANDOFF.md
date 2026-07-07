# Switchboard: Audit, Roadmap, and Opus 4.8 Hand-off Prompts

*Prepared 2026-07-07. A full read of the tree: 8 migrations, 22 server-action
files, 23 routes, the AI layer, cron/push/email infrastructure, and every page
and client component. Build, lint, and the 50 unit tests all pass green.*

---

## TL;DR

Switchboard is **much further along than a prototype** — essentially every
feature named across the README, the v1 spec, and both innovation waves is
wired end-to-end (DB table → server action → reachable UI). The component
system is coherent and genuinely reused, and the marquee flows (event wizard,
Living Room chat, profile editor, guest RSVP) are polished with real
pending/optimistic/error handling.

What stands between it and a "very high-level finished app" is not missing
features — it's **three serious security holes**, a set of **cross-cutting
polish gaps** (no loading/error states, half the product hidden from the nav,
silent failures on secondary actions), and the **production hardening** any
real launch needs (offline SW, CI, seeded e2e tests, env wiring). None of it is
deep; it's a focused 2–3 week hardening-and-polish pass, and I've written it up
as sequenced, copy-pasteable hand-off prompts below.

**Do the security fixes first — before any deploy that touches real user data.**

---

## Part 1 — State of the repo

### What's genuinely done and good
- **Feature completeness:** cascading invites, anonymous weighted polls, mutual
  mode, availability signals, Living Rooms with AI auto-filing, AI discovery,
  shared moments, neighborhood boards, co-hosts, split-the-bill, capsules, RSVP
  questions, announcements, guest links, open tables, run-it-back, matchmaker,
  households, rituals, energy/social-battery, venues/perks, reconnection radar,
  and voice-first planning are all implemented and reachable.
- **Infrastructure that actually works** (gated on env keys, not stubbed): push
  via `web-push`+VAPID (quiet-hours aware, prunes dead subs), email via the
  Resend HTTP API, the 1-minute Vercel cron sweeping cascades + polls +
  reminders, ICS export, Google Calendar links, dynamic OG images.
- **The anonymity invariants hold.** Poll votes are author-only with aggregates
  via a `security definer` function; mutual intents are author-only and
  matching runs in a trigger, so unrequited interest never leaks.
- **The cascade engine is pure and unit-tested**, and AI is a true bonus layer —
  every AI path has a deterministic fallback, and the model IDs
  (`claude-haiku-4-5-20251001`, `claude-sonnet-4-6`) are current and valid.
- **Clean bill on the basics:** `npm run build`, `npm run lint`, and
  `npm test` (50 tests) all pass; no TODO/FIXME debt in source.

### The design-doc drift (read this before trusting the docs)
`docs/DESIGN-DIRECTIONS.md` and the v1 spec describe **"warm editorial calm"** —
cream/paper surfaces, terracotta accent, Fraunces + Inter. The shipped app is a
different, internally-consistent system: **"bold, bright, social"** — a pink
`#f82a63` accent, Work Sans for everything, vivid per-plan gradient cards. The
old `--color-terracotta` token name was kept but repurposed to pink. So the
implementation is coherent; the *docs are stale*. Anyone (including an AI agent)
using the docs as source of truth will be misled. **First task below is to
reconcile the docs to reality and pick a final art direction.**

---

## Part 2 — Findings by severity

### CRITICAL (fix before any real-data deploy) — all verified in source

**C1 — Any authenticated user can join any Living Room and read all its private
content.** `supabase/migrations/20260703120000_init.sql:422-427`. The
`room_members_insert` policy has an `or member_id = auth.uid()` branch that lets
any user insert themselves into any room by id. All room read policies key off
`is_room_member()`, so this exposes every message, expense ledger, and filed
address/door-code to anyone who learns a `room_id` (event pages expose
`events.room_id` to any viewer). The legitimate join paths use the service-role
client and don't need this branch — it's pure attack surface. **Fix:** delete
the `or member_id = auth.uid()` clause.

**C2 — Anyone can cancel any event they don't own** via the "Open to Reschedule"
path. `src/lib/actions/mutual.ts:68-73`. When two colluding accounts mirror an
`open_to_reschedule` intent pointing at a victim `event_id`, the trigger marks
them matched and the code cancels the event with the **admin client, with no
host/participant check**. The event UUID is harvestable from any guest RSVP link
or the public OG route. **Fix:** verify the caller is the host or an invitee of
that event before cancelling, ideally inside a `security definer` function.

**C3 — Guest RSVP acceptance is not capacity-atomic.**
`src/lib/actions/invites.ts:186-204`. The registered-user path correctly uses
the locked `respond_to_invite` DB function, but the guest path hand-rolls a
read-then-write capacity check with the admin client and no row lock — a classic
TOCTOU race that lets concurrent guest accepts overfill an event. This makes the
README's "atomic capacity-checked accept" only partially true. **Fix:** route
guest acceptance through the same locked DB function.

### HIGH

- **H1 — AWI poll is unreachable by invitees during the `deciding` phase.**
  `createEvent` with a poll sets status `deciding` and leaves invites `queued`,
  but `can_view_event` excludes queued invitees, and poll select/insert RLS
  requires `can_view_event`. Only the host can see or vote on the poll until the
  host moves to `inviting`. The headline group-vote flow is broken at the data
  layer. (`events.ts:93`, `init.sql:156-165, 478-482`.)
- **H2 — Cascade apply step is non-atomic.** `cascade-runner.ts:51-65` reads,
  computes, then writes invite transitions one-by-one with no status
  precondition or transaction, so a concurrent cron sweep can send bogus invites
  off a stale snapshot. No over-capacity (the accept RPC is atomic), but spurious
  invitations and partial-write-on-crash. **Fix:** apply transitions in one
  guarded DB function.
- **H3 — Prompt-injection → unsanitized URL persisted.** `ai/extract.ts:105`
  stores the model's extracted `url` verbatim into `room_items` (unlike the
  profile-link path which calls `sanitizeUrl`). A crafted chat message can inject
  a `javascript:`/`data:` URL that becomes stored XSS if the frontend renders it
  as an href. **Fix:** allow only `http`/`https` before insert.
- **H4 — Cron endpoint is public when `CRON_SECRET` is unset.**
  `api/cron/cascade/route.ts:12-18` skips the auth check entirely if the secret
  isn't configured, and `/api/cron` is in the public middleware prefixes. **Fix:**
  fail closed — require the secret to be set and always compare.

### MEDIUM (nine items — details in the security hand-off prompt below)
Arbitrary `question_id` on RSVP answers (M1); answers saved before capacity
decision (M2); push-subscription hijack via endpoint upsert (M3); OG route leaks
event title/time/location for any UUID (M4); `sweepReminders` double-send under
overlapping cron (M5); `allow_suggestions` gate enforced only in the action not
RLS (M6); `sweepCascades` scans all inviting events every minute — won't scale
(M7); ritual proposer can self-accept (M8); `appUrl` yields broken relative
links when `NEXT_PUBLIC_APP_URL` is unset, silently breaking email links (M9).

### Co-host permission inconsistency (correctness, not security)
Co-hosts get powers only through the server actions that use `is_event_host` +
admin client (confirm/cancel/start). RLS-guarded direct writes (announcements,
`closeVoting`/`pickWinner`) still check `host_id` directly, so **co-hosts cannot
post announcements or resolve polls** despite the feature description.

### UX / product-polish gaps (cross-cutting)
1. **No route-level loading, error, or not-found UI anywhere** — zero
   `loading.tsx`/`error.tsx`/`not-found.tsx`, no Suspense, no skeletons. Query-
   heavy server pages show a blank screen until everything resolves, and any
   query error hits the default Next error screen.
2. **Half the product is hidden from the bottom nav.** `BottomNav` exposes only
   Home, Explore, create-FAB, Calendar, Boards, Profile. Mutual, Moments, Rooms,
   People, Zones, and Settings are only reachable via conditionally-rendered Home
   sections (empty for new users) or Profile → "More". A new user can't find most
   of the app.
3. **Errors silently swallowed on many secondary mutations** — join requests,
   matchmaker/ritual/energy responses, signal set/clear, connect, circle/
   household edits, moment responses, expense/task toggles all ignore failures,
   leaving buttons that appear to do nothing.
4. **Destructive actions inconsistently confirmed** — only event-cancel confirms;
   remove-friend, delete-household, end-ritual, remove-board-post, remove-co-host,
   delete-expense all fire instantly with no confirm and no undo.
5. **Mislabeled dead-end:** the header bell is `aria-label="Notifications"` but
   links to `/profile`; there is no notifications surface.
6. **Not realtime where the spec promised it** — only Room chat uses Supabase
   realtime. Mutual match and the "live" poll consensus meter only update on your
   own action's `router.refresh()`, so they don't move when others act.
7. **Leftover terracotta-era accent colors** on native range/checkbox controls
   (`accent-[oklch(...)]` orange/green) clash with the pink brand in Moments,
   Zones, Settings, Rooms.
8. **Gold-on-light contrast failures** — `text-gold` (#eeae36) on `bg-gold-soft`
   in `CascadeProgress` and the board moderator badge fail WCAG AA.
9. **Missing focus-visible + sub-44px touch targets** on the many hand-rolled
   `<button>`s (room/board tabs, select rows, tiny text actions).
10. **`ProfileTabs` "Activity" tab is a visible stub** ("Your activity will show
    up here."). Discover has no empty state when curation returns zero results.

### Stranded / cosmetic
- **CSV guest export** endpoint is complete but linked nowhere in the UI.
- **OG images** work but are wired only into the guest-RSVP page; direct event
  links get no custom card (event page has no `generateMetadata`).
- **"Open to Reschedule"** is fully handled server-side but no component ever
  triggers it (and see C2 — it needs auth-fixing first).
- **Themes** — `theme` column and rendering exist, but no picker in the wizard.
- **Weather note** is a static "looks outdoor" nudge; no forecast, no plan-B.

### Production readiness
- **Service worker has no `fetch` handler** → installable + push only, not
  offline-capable.
- **Icons are SVG-only** — no PNG 192/512 some platforms want.
- **No CI** — `.github/` is absent; nothing runs build/lint/test on push.
- **No `.env.example`** despite the README referencing one.
- **e2e covers only the public surface** (5 tests); the core authenticated
  journeys the spec promised (create→cascade→accept, vote→resolve, mutual match)
  and the RLS anonymity invariants have no automated test.
- **Unit coverage gaps:** `notify`, `poll-runner`, `radar`, `cascade-runner`,
  all of `lib/ai/*`, and every server action are untested.

---

## Part 3 — Recommended sequencing

**Phase 0 — Security (blocking, ~2–3 days).** C1–C4, then the MEDIUM list and
the co-host RLS inconsistency. Add SQL tests for the two anonymity invariants and
the room-membership fix so they can't regress.

**Phase 1 — Correctness & data integrity (~2–3 days).** H1 (deciding-phase poll
access), H2 (atomic cascade apply), guest-accept through the locked function
(shared with C3), then M1/M2/M5/M8.

**Phase 2 — UX scaffolding (~3–4 days).** Route-level loading/error/not-found +
skeletons; a real bottom-nav IA that surfaces all features (consider a "More"
sheet or a 2nd row); consistent error surfacing (a toast system) and destructive-
action confirms; fix the notifications bell; the contrast/focus/touch-target and
leftover-accent-color regressions.

**Phase 3 — Realtime & the finishing details (~3–4 days).** Realtime for mutual
match + poll consensus; wire the stranded CSV export, event-page OG, theme
picker; the co-host powers; ProfileTabs activity feed; Discover empty state.

**Phase 4 — Production hardening (~3–4 days).** Offline SW + PNG icons + custom
install prompt; CI (GitHub Actions: build/lint/test/e2e); `.env.example`; seeded
Playwright journeys + RLS SQL tests; rate limiting on guest RSVP + auth + cron.

**Phase 5 — Design elevation & differentiation (ongoing).** Reconcile the docs,
commit to one art direction, and build the competitive moves in Part 5.

---

## Part 4 — Hand-off prompts for Opus 4.8

Each prompt is self-contained and copy-pasteable. They assume the repo at its
current state and reference exact files. Give them **in order** — later prompts
assume earlier fixes landed. Each ends with the same quality bar: build, lint,
tests green, and a short written summary of what changed and how it was verified.

> **Standing preamble to prepend to every prompt** (the repo enforces it):
> *"Read `AGENTS.md` first. This is a modified Next.js 16 — before writing any
> code, read the relevant guide in `node_modules/next/dist/docs/` and heed
> deprecation notices. Work on a feature branch, keep changes additive and
> migration-safe, and finish with `npm run build && npm run lint && npm test`
> all green plus a written summary of what you changed and how you verified it.
> Match the existing code's style, component reuse, and copy voice — no
> emdashes, no italics in headers, no hedging."*

---

### Prompt 1 — Close the critical security holes

```
You are hardening the Switchboard codebase (Next.js 16 + Supabase). There are
four verified security defects. Fix all of them with minimal, migration-safe
changes, and add regression tests. Do NOT refactor unrelated code.

C1 — Private-room breach. In supabase/migrations/20260703120000_init.sql the
room_members_insert policy (around line 422) has an `or member_id = auth.uid()`
branch that lets ANY authenticated user insert themselves into ANY room and thus
read all its messages, expenses, and items (all room read policies use
is_room_member()). Write a NEW forward migration that drops and recreates
room_members_insert WITHOUT that branch (keep only the room-creator check). All
legitimate joins already go through the service-role client, so normal flows must
still work — verify respondToInvite, the moment/match room creation, and board
membership still add members. Do not edit the historical migration file; add a
new timestamped one.

C2 — Arbitrary event cancellation. src/lib/actions/mutual.ts (around line 68)
cancels an event with the admin client when an `open_to_reschedule` intent
matches, with NO check that either party hosts or is invited to that event.
Before cancelling, verify the acting user is the host OR an accepted invitee of
eventId; if not, skip the cancel (still record the match). Prefer moving the
cancel into a security-definer DB function that performs the authorization check
atomically. Add a unit or integration test proving a non-participant cannot
cancel.

C3 — Non-atomic guest capacity. src/lib/actions/invites.ts (around line 186) the
guest RSVP path hand-rolls a read-then-write capacity check with the admin
client and no lock, so concurrent accepts can exceed capacity. Route guest
acceptance through the SAME locked respond_to_invite DB function the registered
path uses (init.sql:169-206), or a sibling security-definer function that takes
the guest token and performs the capacity decision under `for update` locks.

C4 (H4) — Public cron. src/app/api/cron/cascade/route.ts skips auth entirely when
CRON_SECRET is unset. Make it fail closed: if CRON_SECRET is not set, return 500
(misconfiguration) rather than running; if set, require the Bearer match.

Also add SQL tests (a supabase/tests/ dir or a documented psql script) that
assert the two anonymity invariants still hold after the C1 migration: (a) a
non-author cannot select another user's poll_votes; (b) a non-author cannot
select another user's mutual_intents; and (c) a non-member cannot insert into
room_members for a room they didn't create. Finish with build/lint/test green
and a summary listing each defect and the exact fix.
```

---

### Prompt 2 — Correctness and data-integrity fixes

```
Continue hardening Switchboard. These are correctness bugs, not security. Fix
each with a minimal change and a test where a pure function is involved.

H1 — AWI poll unreachable during `deciding`. When createEvent
(src/lib/actions/events.ts:93) enables a poll it sets status='deciding' and
leaves all invites 'queued', but can_view_event (init.sql:156-165) excludes
queued invitees, and poll select/insert RLS requires can_view_event — so only the
host can see or vote on the poll. Fix so invitees to a `deciding` event can view
options and cast votes, WITHOUT weakening the poll_votes author-only-read
invariant. Options: broaden can_view_event to include queued invitees of a
deciding event, or send a stage-0 wave before opening the poll. Pick one, explain
why, and verify a non-host invitee can vote while a stranger still cannot.

H2 — Non-atomic cascade apply. src/lib/server/cascade-runner.ts:51-65 applies
invite transitions one-by-one with unconditional `.eq('id', ...)` writes and no
transaction, so a concurrent cron sweep can send invites off a stale snapshot.
Move the apply into a single security-definer DB function that re-reads under
lock and only transitions invites whose status still matches the expected
precondition. Keep the pure engine in src/lib/engine/cascade.ts unchanged (it's
the tested source of truth); only the apply/persistence step changes.

Then the MEDIUM data-integrity items:
- M1: in src/lib/actions/invites.ts, validate that each answered question_id
  belongs to the invite's event before upserting invite_answers.
- M2: don't persist RSVP answers when the outcome is 'waitlisted'/not accepted
  (or defer the answer-write until after an 'accepted' decision).
- M5: guard sweepReminders (src/lib/server/reminders.ts) against double-send
  under overlapping cron runs — claim each reminder by conditionally updating the
  marker column first (update ... where marker is null) and only sending if the
  claim succeeded.
- M8: in src/lib/actions/rituals.ts, prevent the proposer from accepting their
  own proposal (respondToRitual should require the acting user to be the partner).

Finish with build/lint/test green and a summary.
```

---

### Prompt 3 — UX scaffolding: loading, errors, navigation, confirmations

```
Raise Switchboard's baseline UX. The component system (src/components/ui/*) is
good and reused — extend it, don't replace it. Match existing style and the
no-emdash/no-hedge copy voice.

1. Loading states. There is no loading.tsx/error.tsx/not-found.tsx anywhere.
   Build a small set of skeleton components (reuse Card/PlanCard shapes) and add
   loading.tsx for the query-heavy routes: /, /events/[id], /profile, /discover,
   /plans, /rooms, /people, /mutual, /moments, /boards. Add a root error.tsx and
   not-found.tsx with on-brand copy and a route back Home.

2. Navigation IA. src/components/shell/BottomNav.tsx hides Mutual, Moments,
   Rooms, People, Zones, and Settings. Redesign the app's information
   architecture so every top-level feature is reachable in at most two taps from
   the nav — e.g. keep the 5 primary tabs but add a "More" sheet (or a secondary
   surface) that lists the rest with icons and one-line descriptions. Make sure a
   brand-new user with an empty Home can still find every feature. Keep the
   create-FAB.

3. Error surfacing. Add a lightweight toast/notice system (client context +
   a component) and wire it into the secondary mutations that currently swallow
   failures: OpenTables.requestToJoin, HomeCards (energy/introduction/ritual),
   SignalBar set/clear, MutualClient (connect/pause/end/withdraw), PeopleClient
   (accept/remove/circle/household/matchmaker), MomentsClient
   (accept/curiosity/pass), RoomClient (delete expense/toggle task), BoardClient
   (delete post/remove member), CoHostManager.removeCoHost, and the Settings
   save forms (which today give no success or error feedback). On failure show
   the error; on success give a subtle confirmation.

4. Destructive confirmations. Add a reusable confirm dialog and require it for:
   remove friend, delete household, end ritual, remove board post, remove
   neighbor, remove co-host, delete expense. (Event-cancel already confirms —
   match that pattern.)

5. Fix the mislabeled bell in src/components/shell/AppShell.tsx (around line 38):
   it is aria-label="Notifications" but links to /profile and there is no
   notifications surface. Either build a minimal notifications view (invites +
   matches + announcements already exist as data) or relabel/remove it. Prefer
   building a simple aggregated notifications list.

Finish with build/lint/test green, verify at 320px width (no horizontal
overflow), and a summary.
```

---

### Prompt 4 — Accessibility, contrast, and brand-token cleanup

```
Fix Switchboard's accessibility and visual-consistency regressions. These are
small, surgical changes.

1. Color contrast. --color-gold (#eeae36) is used as text on light surfaces and
   fails WCAG AA: text-gold on bg-gold-soft in
   src/components/events/CascadeProgress.tsx (the "Invited - waiting" /
   "Waitlisted" labels) and the moderator badge in
   src/app/boards/[slug]/BoardClient.tsx. Replace with an accessible
   dark-on-gold-soft or gold-deep token that meets 4.5:1. Also fix the
   bg-gold text-white swatch on src/app/design/page.tsx.

2. Leftover terracotta-era accents. Native controls still use hardcoded
   off-brand accent colors instead of the pink token:
   src/app/moments/MomentsClient.tsx:134,
   src/app/zones/[slug]/ZoneCheckIn.tsx:71, src/app/settings/page.tsx:169
   (orange accent-[oklch...]), and src/app/rooms/[id]/RoomClient.tsx:430 (green).
   Migrate all to accent-terracotta (the pink token) to match EventWizard.

3. Focus-visible + touch targets. Many hand-rolled <button>s lack
   focus-visible:ring and are below ~44px: room/split tabs (RoomClient),
   board post-type toggle (BoardClient), friend/person select rows (MutualClient,
   EventWizard), the friend expander (PeopleClient), and the small
   remove/withdraw/end/pause text actions. Add focus-visible rings (match
   Button.tsx:37) and ensure a 44px min tap target. Prefer routing these through
   the shared Button/Chip where reasonable.

4. Reconcile the design docs. docs/DESIGN-DIRECTIONS.md and the v1 spec describe
   a "warm editorial" terracotta+Fraunces system, but the app actually ships a
   "bold, bright, social" pink + Work Sans system (globals.css). Update the docs
   to describe the ACTUAL implemented design system (tokens, type, the plan-card
   gradient language) so they're a true source of truth, and note the five
   candidate directions as historical.

Finish with build/lint/test green and a summary. Where feasible, add a quick
Playwright check that the previously-failing contrast labels use the new token.
```

---

### Prompt 5 — Realtime and the stranded features

```
Finish the flows Switchboard's spec promised as "live", and wire up the
functionality that exists in the backend but has no UI.

1. Realtime mutual match. src/app/mutual/MutualClient.tsx only surfaces a match
   after the user's own action triggers router.refresh(). Add a Supabase realtime
   subscription (model it on the working one in src/app/rooms/[id]/RoomClient.tsx
   lines ~89-114) so that when the OTHER person matches you, the match appears
   live without a manual refresh. Respect the anonymity invariant — only react to
   rows the current user is a party to.

2. Live poll consensus. src/components/polls/PollSection.tsx refreshes the
   consensus meter only on the user's own vote. Subscribe to poll aggregate
   changes so the meter moves as others vote, without ever exposing individual
   votes (keep reads going through poll_results()).

3. CSV export. src/app/api/events/[id]/guests.csv/route.ts is complete but linked
   nowhere. Add a host-only "Export guest list" download link on the event page
   (src/app/events/[id]/page.tsx).

4. Event-page OG images. The OG route exists and the guest-RSVP page already sets
   openGraph metadata. Add the same generateMetadata/openGraph block to
   src/app/events/[id]/page.tsx so directly-shared event links get a custom card.

5. Co-host powers. Co-hosts can confirm/cancel/start an event but CANNOT post
   announcements or resolve polls, because those paths check host_id directly in
   RLS. Update the announcements and poll close/pick paths (and their RLS
   policies) to accept co-hosts via the is_event_host check, matching the other
   host actions. Add a new migration for the RLS change.

6. ProfileTabs activity feed. src/app/profile/ProfileTabs.tsx:61-65 renders a
   permanent "Your activity will show up here." stub. Build a real activity feed
   from existing data (events hosted/attended, matches, capsules) or, if that's
   out of scope, remove the tab rather than ship a stub.

7. Discover empty state. src/app/discover/DiscoverClient.tsx shows nothing when
   curation returns zero results — add an on-brand empty state.

Finish with build/lint/test green and a summary.
```

---

### Prompt 6 — Production hardening: PWA, CI, tests, rate limiting

```
Make Switchboard production-ready.

1. Offline-capable PWA. public/sw.js has no fetch handler, so the app is
   installable + push-only, not offline. Add a fetch handler with a sensible
   caching strategy (app shell precache + network-first for data, cache-first for
   static assets). Add PNG icons at 192x192 and 512x512 (plus maskable) alongside
   the existing SVGs, and reference them in src/app/manifest.ts. Add a tasteful
   custom install prompt (handle beforeinstallprompt) and iOS add-to-home-screen
   guidance.

2. CI. There is no .github/. Add a GitHub Actions workflow that runs, on push and
   PR: npm ci, npm run lint, npm run build, npm test, and the Playwright e2e
   suite. Cache node_modules. Fail the build on any error.

3. .env.example. The README references one but it doesn't exist. Create it with
   every env var the code reads (Supabase URL/anon/service-role, ANTHROPIC_API_KEY,
   RESEND_API_KEY, EMAIL_FROM, NEXT_PUBLIC_APP_URL, VAPID keys, CRON_SECRET) with
   short comments and safe placeholder values. Also fix M9: src/lib/server/email.ts
   appUrl() silently produces relative links when NEXT_PUBLIC_APP_URL is unset —
   make it throw or log loudly in production so email links can't ship broken.

4. Seeded e2e journeys. The e2e suite (e2e/public.spec.ts) only covers the public
   surface. Add a seed fixture (a script that creates test users + data via the
   service-role client against a local/test Supabase) and Playwright tests for the
   three core authenticated journeys the spec named: create -> cascade -> accept;
   create poll -> vote -> resolve; mutual match between two users. Document how to
   run them.

5. Rate limiting. Add rate limiting to the guest RSVP endpoint, the auth/login
   path, and the cron route (defense in depth on top of the C4 fix). A simple
   IP/token bucket in middleware (src/proxy.ts) or per-route is fine; explain the
   choice.

6. Unit-test the gaps: src/lib/server/notify.ts (esp. isQuietTime),
   poll-runner.ts, radar.ts, and the AI fallbacks in src/lib/ai/* (that the
   deterministic fallback fires when no key / on error).

Finish with build/lint/test/e2e green and a summary.
```

---

## Part 5 — Making it competitive, innovative, and beautiful

These are the moves that take Switchboard from "finished and solid" to
"distinctive." Rough effort in parens.

### Commit to a singular visual identity (the biggest lever)
The current pink-gradient system is clean but reads as a generic modern social
app — exactly the "AI-made" tell the design docs warn against. The docs already
contain five *specific*, characterful directions. **Transit Board** (the cascade
literally rendered as a departures board: `ALEX / ASKED / 14 MIN`) is the
strongest product-story fit because it turns Switchboard's most original
mechanic into the brand. **Dusk Lounge** (warm candlelit dark) is the strongest
premium/evening-social play. Pick one and commit the whole token layer, type
system, and key screens to it. A distinctive, opinionated identity is the single
highest-leverage differentiator here. (L)

### Lean into the mechanics no one else has
Switchboard's moat is the *social physics*, not the feature count. Make them
legible and delightful:
- **The cascade as a signature animation.** A beautiful, physical
  flip/advance animation for the cascade progress view (Transit Board's flap
  board) would be genuinely memorable and shareable. (M)
- **Consensus meter as live theater.** Once realtime lands, the anonymous
  consensus bar filling in real time during a group decision is a "wow" moment
  competitors (Partiful, Doodle) structurally can't copy because they're not
  anonymous. Make it feel alive. (S once realtime exists)
- **Match reveal choreography.** The three-consent moment reveal deserves a
  crafted "glow up from black" reveal (the Dusk Lounge motif). This is the
  emotional peak of the app. (M)

### Quick-win features that are 80% built (finish these for outsized ROI)
From the completeness audit, these have the data layer already done:
- **Anniversary Rewind + Seasons Recap** — memory/retention hooks; Run It Back
  already exists to power them. (S–M)
- **Handle Cards / QR** — the top-of-funnel add-a-friend flow; handles and
  connection-by-handle already work. `qrcode` is already a dependency. (S)
- **Arrival Mood** — one-tap optional note on RSVP; energy logging + RsvpCard
  already exist. (S)
- **Cascade Coach** — private post-event analytics for hosts; all the timing
  data already lives in `invites`. This is the kind of "the app learns plan
  mechanics so you don't have to" intelligence that feels premium. (M)
- **Flake Insurance** — auto-offer a freed seat to the waitlist on late cancel;
  the `waitlisted` state already exists. Big real-world value. (S–M)

### Bigger bets that differentiate
- **Availability Heatmap** for hard-to-schedule groups (paint free times, overlap
  glows) — the single slowest part of group planning, and a great mobile
  interaction if done well. (M)
- **Weather Guardian** (real forecast + one-tap plan-B poll) — upgrade the
  existing static nudge into something that actively saves outdoor plans. (M)
- **Calendar Sync** (read-only Google free/busy) — multiplies the intelligence of
  windows, rituals, and the heatmap. Highest trust bar; be transparently
  read-only. (L)
- **Surprise Mode** (one guest hidden while everyone coordinates) — a delightful
  coordination trick, but needs careful RLS (a leak is catastrophic). Ship it
  only with a dedicated SQL test. (M)

### Positioning
Switchboard's one-sentence wedge — *"plans without the pressure: nothing is
revealed unless both sides choose it, nothing nags"* — is genuinely
differentiated against Partiful (blast-everything) and Doodle (scheduling only).
Every screen and every piece of copy should ladder back to *permission* and
*calm*. The restraint is the brand; resist the urge to add urgency mechanics
(streaks, counts of declined invites, read receipts) even where they'd juice
engagement — they would break the core promise.

---

## Appendix — verification status

- `npm run build`, `npm run lint`, `npm test` (50 tests) all pass on the current
  tree.
- C1, C2, C3 were read directly in source and confirmed as described.
- Feature-completeness and infrastructure claims were verified file-by-file
  against migrations, actions, and routes.

---
---

# Part 6 — The strategy layer: product, growth, interoperability, and how to build it well

*Everything above is the engineering audit — what to fix to make the app solid.
Everything below is the strategy to make it a category-defining product: how to
drive engagement and word-of-mouth without becoming the kind of app the world
has too many of, how to make Switchboard the connective tissue between every
other planning app (even competitors), and how to run the project itself at a
high level. This section is grounded in current (2025–2026) research; sources are
linked inline so claims are auditable rather than asserted. Each subpart ends
with copy-pasteable Opus 4.8 hand-off prompts where there's something to build.*

## The north star that makes everything else coherent

Switchboard has one strategic advantage that resolves almost every hard tradeoff
below: **its payoff happens off-screen, in real life.** A feed app has to keep
you staring at it to deliver value, which forces it toward manipulative
mechanics. Switchboard delivers value when you close the app and go meet people.
That means the *humane* design and the *growth-optimal* design are the same
design — you don't have to choose between doing right by users and winning.

Concretely, this argues for a **humane North Star Metric: real-world gatherings
that actually happened** — unique plans confirmed as having occurred with ≥2
people attending, per period (working name: *Plans-That-Happened*, or "faces
met"). It cannot be inflated by more scrolling or more notifications; it can only
go up when the product succeeds at its actual mission. This is the metric to
instrument, optimize, and report on — not DAU, not time-in-app, not sessions
([North Star framing, Lenny Rachitsky](https://www.lennysnewsletter.com/p/how-to-determine-your-activation)).

Supporting metrics act as guardrails so you never secretly optimize screen time:
- **Activation:** % of new users who reach one happened-plan within 14 days (a
  Facebook-style "magic number" tuned to Switchboard —
  [Mode on Facebook's 7-friends-in-10-days](https://mode.com/blog/facebook-aha-moment-simpler-than-you-think/)).
- **Habit proxy (low-frequency-aware):** % of users who create *or meaningfully
  respond to* a plan in a rolling 30-day window — not DAU.
- **Invitation health:** share of new users arriving via an organic plan-invite
  (not a bribe), and invite acceptance rate.
- **Time-to-plan (an *inverse* metric you want low):** median minutes from app
  open to a decision made. Calm Technology's principle is to require the smallest
  possible amount of attention ([Amber Case](https://www.caseorganic.com/post/principles-of-calm-technology)).
- **Anti-goal, watched to stay flat or fall:** average session length and
  notifications-per-user. If these grow, something has gone wrong.
- **PMF check:** the Sean Ellis "very disappointed if this went away" survey,
  ≥40% threshold ([pmfsurvey.com](https://pmfsurvey.com/)).

Why this is defensible and not just idealism: the U.S. Surgeon General's May 2023
advisory found social disconnection carries mortality risk comparable to smoking
up to 15 cigarettes a day and raises premature-death risk ~26–29%
([PBS coverage](https://www.pbs.org/newshour/health/loneliness-poses-health-risks-as-deadly-as-smoking-u-s-surgeon-general-says)).
Dunbar's work shows online ties are typically weaker and cannot fully substitute
for in-person contact ([Calling Dunbar's Numbers](https://www.sciencedirect.com/science/article/pii/S0378873316301095)).
The "social snacking" research is the exact frame for what Switchboard must *not*
be — superficial digital contact is a snack: momentarily satisfying, lacking the
nutrition of real connection ([Gardner, Pickett & Knowles](https://www.taylorfrancis.com/chapters/edit/10.4324/9780203942888-18/social-snacking-shielding-wendi-gardner-cynthia-pickett-megan-knowles)).
There is a real, large, underserved need here, and the honest product is also the
big one.

---

## Part 7 — Engagement, retention, and humane growth

The engagement playbook (hook loops, habit formation, activation metrics,
referral loops) is mechanically neutral — the same machinery powers a meditation
app and a slot-machine feed. What separates humane from harmful is *whose goals
it serves.* Nir Eyal — who literally wrote the habit-forming-products bible
*Hooked* — gives the cleanest test with his **Manipulation Matrix**: does it
materially improve the user's life, and would the maker use it themselves? The
target quadrant is the **Facilitator** (yes to both)
([Manipulation Matrix](https://designli.co/blog/using-the-manipulation-matrix-for-ethical-behavioral-design/)).
Eyal's later book *Indistractable* reframes the goal as helping people take
*traction* (action toward what they intended) rather than *distraction*
([nirandfar.com/indistractable](https://www.nirandfar.com/indistractable/)).

### Evidence-based UX principles Switchboard should adopt

1. **Make the "aha" a real plan with a real person, and reach it in under 10
   minutes.** The activation moment for an event app is *"I proposed something
   and real people said yes — a plan now exists,"* not a completed profile. The
   first-run flow should reach a sent invite before asking for anything optional
   (photo, bio, notification permission)
   ([activation](https://www.lennysnewsletter.com/p/how-to-determine-your-activation)).
2. **Design the empty state as the onboarding.** A new user's Home has no plans —
   that blank should teach one obvious next action ("Float an idea to your
   group"), not present a dashboard of dormant features. (Directly actionable
   against the current empty Home noted in Part 2, item 2 and the Discover
   empty-state gap.)
3. **Trigger the habit off life-events, not a clock.** Nobody makes plans daily,
   so Switchboard can't own a daily time-slot; it should attach to natural cues —
   a free Friday, a friend in town, an RSVP arriving. The **availability signal**
   ("I'm free this weekend") is the ideal 5-second habit anchor
   ([James Clear, habit loop](https://jamesclear.com/atomic-habits-summary)).
4. **Shrink the core action to one tap (Fogg's B=MAP).** A behavior fires when
   motivation, ability, and prompt converge; the cheapest lever is raising
   *ability* by shrinking the action. One-tap poll responses and one-tap
   availability ("Free / Busy / Maybe") cost almost no motivation
   ([Fogg model](https://www.thebehavioralscientist.com/articles/fogg-behavior-model)).
5. **Celebrate the real-world outcome, never an in-app streak.** Fogg's
   under-used principle is immediate positive emotion right after the behavior —
   but put it on the offline win: after an event passes, a warm *"You got 4
   people together on Saturday"* recap. (Run It Back and capsules already exist to
   power this — see the quick-wins in the feature audit.)
6. **Ban guilt-streaks and loss-aversion counters.** Streaks that punish absence
   are exactly the manipulative mechanics the Center for Humane Technology
   catalogs; a plan-making app that shamed you for a quiet week would optimize
   against its own mission. There is already a note in Part 5 to resist these —
   this is the research backing it.
7. **Treat the notification as the product *exit*, not a re-engagement hook.**
   Batch into a digest ("4 people RSVP'd," not 4 pings), priority-tier so only
   time-sensitive things interrupt, and honor quiet hours (already built).
   Strong preference controls correlate with 43% lower opt-out and 31% higher
   engagement ([Novu](https://novu.co/blog/digest-notifications-best-practices-example/)).
   Every notification's job is to send you toward the plan and off the app.
8. **Keep the app in the periphery of attention (Calm Technology).** An ambient
   "who's free this weekend" glance-view informs without demanding a session — no
   feed to scroll, no dwell mechanics ([Calm Tech principles](https://www.calmtech.institute/calm-tech-principles)).
9. **Make invitation the product, not a referral bribe.** The healthiest growth
   loop is a product you *cannot use alone*: "come for the tool, stay for the
   network" ([cdixon](https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network/)).
   Cascading invites already embody this — inviting is *how the plan works*, not a
   bolt-on "invite 10 friends for points" (which is the Dealer quadrant).
10. **Make the invite feel like a gift, and never auto-harvest the address
    book.** Good invitations trade on reciprocity and genuine benefit to the
    recipient. The cautionary tale is LinkedIn's contact-import overreach — a
    $13M settlement (see Part 8's trust section). Default to a link the host
    chooses to send; explicit per-invite consent.
11. **If you reward invitations at all, use double-sided *product* value, not
    points.** Dropbox's referral loop worked because both sides got real value
    and it lived inside onboarding; at peak 35% of signups came from referrals
    ([Dropbox referral](https://referralrock.com/blog/dropbox-referral-program/)).
    For Switchboard the intrinsic incentive is stronger: your Saturday is simply
    better with more friends there.
12. **Validate fit with the Sean Ellis survey, and gate growth spend on it.**
    ≥40% "very disappointed" is the empirical PMF threshold; it measures
    emotional dependence on a *good outcome*, the humane analog to retention
    ([pmfsurvey.com](https://pmfsurvey.com/)).

### A retention model for a low-frequency behavior

Daily-active retention is the wrong lens and would push you toward dark patterns
to hit it. Instead:
- **Measure on the natural period.** Use monthly / per-social-occasion active,
  and judge success by whether the **cohort retention curve flattens** to a
  stable plateau — a flat 30-day curve at a modest level is *success* for a
  low-frequency app, not failure.
- **Own an event-based trigger, not a time-based one.** The availability signal
  and group poll convert an infrequent, high-effort decision ("organize
  something") into a frequent, tiny one ("tap that I'm free").
- **Bridge the gaps with peripheral, opt-in value** so absence isn't churn — the
  ambient "who's around" layer and a single digest are the only proactive
  touches.
- **Define a retained user by outcomes, not logins:** ≥1 happened-plan per
  rolling 8–12 weeks. Optimize the loop create-plan → it-happens → warm-recap →
  next-plan-is-easier.

### The cautionary tale to internalize: BeReal

BeReal's once-a-day, no-likes, no-filters model was genuinely anti-engagement and
worked spectacularly at first — ~73.5M active users by Aug 2022
([Business of Apps](https://www.businessofapps.com/data/bereal-statistics/)) —
then collapsed and sold to Voodoo in June 2024 for ~€500M/$537M while losing
~$3M/month, un-monetized ([Sifted](https://sifted.eu/articles/voodoo-bereal-2024-results)).
Three lessons for Switchboard:
1. **Novelty ≠ habit.** A single clever mechanic creates a spike, not a durable
   behavior. Switchboard's defense is that it anchors to a *recurring real-life
   need* (making plans) that doesn't wear off.
2. **Low frequency needs a low-frequency-compatible value/business model from day
   one** — don't assume daily engagement and then discover you can't monetize it.
3. **Don't betray the ethos to chase engagement.** BeReal diluted its discipline
   with feeds, celebrities, and ads post-peak. For Switchboard, adding feed-y,
   streak-y, vanity mechanics to juice numbers would be self-defeating — the
   restraint *is* the product. (Clubhouse is the parallel lesson on scarcity:
   an invite-only waitlist drove a spike to ~10M downloads then collapsed to
   ~900K once there was no durable habit underneath —
   [analysis](https://www.justanotherpm.com/blog/the-rise-and-fall-of-clubhouse-what-product-managers-learn-from-it).)

> ### Hand-off Prompt 7 — Instrument the humane North Star and activation
> ```
> Add privacy-respecting product analytics to Switchboard so we can measure the
> RIGHT things. Use PostHog (cookieless/EU mode) behind a Next.js rewrite reverse
> proxy so it survives ad-blockers, plus keep it lightweight. Do NOT track
> content of messages, votes, or intents (respect the anonymity invariants).
>
> Instrument these events and derive these metrics:
> - North Star: "plan happened" — fire when an event's start time passes and it
>   had >=2 accepted attendees (or when a host/attendee marks it happened). Build
>   a way to mark-as-happened on the event page after it ends.
> - Activation: new user reaches their first happened-plan within 14 days.
> - Habit proxy: user created OR responded to a plan in a rolling 30-day window.
> - Invitation health: new-user source (organic invite vs other) and invite
>   acceptance rate.
> - Time-to-plan: median minutes from app open to a decision (poll vote, RSVP,
>   or plan created) — an inverse metric we want LOW.
> - Guardrail/anti-goals, surfaced on a simple internal dashboard: average
>   session length and notifications-per-user (we want these flat or falling).
> Add the Sean Ellis PMF one-question survey (would you be very disappointed if
> Switchboard went away?) as an occasional, dismissible in-app prompt, stored for
> later analysis. Feature-flag everything through PostHog so flags double as kill
> switches. Finish with build/lint/test green and a summary, and document every
> tracked event in docs/analytics.md with a one-line "why we track this."
> ```

> ### Hand-off Prompt 8 — The <10-minute activation onboarding + real recap loop
> ```
> Redesign Switchboard's first-run so a brand-new user reaches the "aha" — a real
> plan with at least one other person — as fast as possible, and close the loop
> with a real-world celebration afterward. Match the existing calm copy voice
> (no emdashes, no hedging, no urgency mechanics).
>
> 1. First-run flow: the very first screen after signup asks "What do you want to
>    do?" (pick or type: dinner, hike, board games). Defer optional profile steps
>    (photo, bio, notification permission) until AFTER a plan exists. Reach a
>    shareable guest link / sent invite in the first session.
> 2. Empty-state-as-onboarding: when Home has no plans, show ONE obvious primary
>    action ("Float an idea to your group") plus a two-line explanation of the
>    calm/consent promise — not a grid of dormant features. Also fix the Discover
>    empty state (no "no results" message today).
> 3. Real-world recap loop: after an event's start time passes, prompt the host/
>    attendees to mark it happened, then show a warm recap ("You got 4 people
>    together on Saturday") that offers one tap to Run It Back. Put the
>    celebration on the OFFLINE outcome, never on an in-app streak. Do NOT add any
>    streak counter, "days active," or decline-count anywhere.
> 4. Notifications: ensure the default is a single digest; only genuinely
>    time-sensitive, actionable items (an invite awaiting your answer, an event
>    today) may interrupt. Respect the existing quiet-hours logic.
> Verify at 320px, build/lint/test green, and summarize what changed.
> ```

---

## Part 8 — Interoperability: be the connective tissue, not a walled garden

**This is the highest-leverage strategic bet in the whole document.** The
event-planning space has two structural facts to exploit:

1. **The incumbents are walled gardens with thin, one-directional exits.**
   Partiful has *no public API* — its only export is a read-only `.ics`
   subscription feed ([Partiful Calendar Sync](https://help.partiful.com/hc/en-us/sections/26025196887707--Calendar-Sync)).
   Luma gates its API behind the paid Luma Plus tier
   ([Luma API](https://help.luma.com/p/luma-api)). Meetup moved to a Pro-only
   GraphQL API in 2025 and broke old integrations
   ([Meetup GraphQL](https://www.meetup.com/graphql/)). Facebook has steadily
   throttled its Events API ([API changes](https://theeventscalendar.com/blog/news/important-facebook-api-changes/)).
   Apple Invites, Evite, Punchbowl, Geneva, and Timeleft are closed too — their
   only reliable export is, again, a read-only calendar file. **Nobody owns the
   neutral connective layer that reads all of them and writes to all of them.**
2. **The winning pattern is "come for the tool, stay for the network," and its
   under-used variant is *interop-as-tool*:** the single-player wedge is
   "Switchboard makes your existing Partiful / Luma / Google-Calendar life
   better," and the network accrues underneath
   ([cdixon](https://cdixon.org/2015/01/31/come-for-the-tool-stay-for-the-network/)).

Switchboard's consent-first positioning is what makes radical interoperability
*safe*: the one place competitors have burned users is contact-harvesting, and a
consent-first app can do humane import where others can't be trusted to.

### The competitive interop surface (who's open, who's closed)

| App | Only way IN | Only way OUT / integration surface |
|---|---|---|
| **Partiful** | Manual re-entry | Read-only `.ics` feed. No API, no webhooks. |
| **Luma** | REST API + Zapier (both Luma-Plus-gated) | Full REST API, Zapier, per-calendar iCal feed — but paywalled. |
| **Meetup** | GraphQL (Pro-only OAuth) | GraphQL over OAuth2, `.ics` export; Pro required to create consumers. |
| **Facebook Events** | Graph API (Pages you admin only) | `.ics` export URL; partner-only Events API; increasingly locked. |
| **Apple Invites** | Manual/Contacts | Calendar auto-sync, guest `.ics` download, shareable web link, open-ended **Link tiles** that accept any URL. No API. |
| **Evite / Punchbowl** | Manual / contact import | Add-to-calendar buttons; Punchbowl exports guest list + contacts (CSV). No API. |
| **Discord** | Bots, slash commands, calendar imports | **Fully open**: bot/HTTP-interactions API, webhooks, Scheduled Events, gateway. Where friend groups already coordinate. |
| **Google Calendar** | Calendar API, CalDAV, `.ics` | **The most open substrate**: REST CRUD, **freebusy.query** (busy intervals only), watch/push, CalDAV two-way, webcal. Where "yes" ultimately lands. |

Sources: [Luma iCal](https://help.luma.com/p/ical-syncing) ·
[Apple Invites Link tiles](https://www.macrumors.com/2025/05/27/apple-invites-app-link-feature/) ·
[Punchbowl export](https://help.punchbowl.com/article/315-how-can-i-export-my-contacts) ·
[Discord events API](https://docs.discord.com/developers/events/gateway-events) ·
[Google freebusy.query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query).

### Buildable interop ideas, ranked by leverage

Leverage = growth impact × reach into competitor bases ÷ effort/risk.

1. **One-way `.ics` subscription feed of "your Switchboard plans"** *(low effort,
   high retention).* Every user gets a personal `webcal://` URL; their plans
   quietly appear in whatever calendar they already live in. It's the *only*
   thing Partiful/Apple Invites/Evite offer, so it's table stakes, and it's the
   cheapest recurring touchpoint you can build. Ship first.
   ([RFC 5545](https://icalendar.org/RFC-Specifications/iCalendar-RFC-5545/))
2. **"Paste a Partiful / Luma / Facebook / Apple-Invites link → import the
   event"** *(medium effort, highest competitive leverage).* The single most
   on-strategy feature: it converts a user of a *closed competitor* into a
   Switchboard host. Parse Open Graph tags + schema.org/Event JSON-LD + any
   exposed `.ics`. Framing: "Already have a party somewhere else? Bring it here,
   calmly." ([schema.org/Event](https://schema.org/Event))
3. **Add-to-calendar everywhere + rich OG/JSON-LD unfurling on every guest link**
   *(low effort, compounding).* Every shared link becomes a beautiful
   iMessage/WhatsApp/Slack card and a one-tap add to any calendar — each invite
   becomes free, native-looking distribution.
   ([iMessage previews](https://scottbartell.com/2019/03/05/implementing-imessage-link-previews/))
   (Note: the event-page OG gap in Part 2 is the first step here.)
4. **Web Share API + Universal/App Links for the guest link** *(low–medium).*
   Cascading invites *are* share actions; make the share sheet native and make
   links open app-or-web seamlessly. Build native links yourself — Firebase
   Dynamic Links shut down Aug 2025
   ([migration](https://firebase.google.com/support/guides/app-links-universal-links)).
5. **Sign in with Apple / Google + Passkeys** *(low–medium, removes onboarding
   friction).* A consent-first brand deserves the calmest possible sign-in;
   passkeys are now expected and measurably higher-converting, and Google sign-in
   pre-positions the later free/busy consent
   ([state of passkeys 2025](https://www.1password.community/blog/random-but-memorable/the-state-of-passkeys-in-2025/163464)).
6. **Google (later Microsoft) `freebusy` for "smart windows"** *(medium effort,
   signature feature).* Availability without reading anyone's event contents —
   `freebusy.query` returns busy intervals only. This is a consent-first
   superpower: "we suggest times that work, and we never see what you're busy
   with." Differentiates hard against a dumb date-poll
   ([freebusy.query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)).
7. **iMessage / WhatsApp / SMS share of a guest link as the default invite rail**
   *(low effort).* Don't force an app install to RSVP (Apple Invites and Partiful
   both allow web RSVP — match that). The cascade spreads through the channels
   people already text in.
8. **Discord bot that posts cascade / RSVP status into the channel** *(medium
   effort, high fit for community organizers).* Discord is where friend groups
   already coordinate and has the most open API of any competitor. A bot that
   mirrors "cascade reached 12 people / 3 spots left" with slash-command RSVP
   meets them exactly where they are ([Apollo precedent](https://apollo.fyi/)).
9. **Email-forward-to-create ("forward any invite to plans@…")** *(medium
   effort).* A universal importer with zero API dependency — forward an
   Evite/Punchbowl/FB/Apple email, parse the `.ics`/body, recreate. Captures the
   closed apps that expose nothing else.
10. **Humane, privacy-preserving contact matching via PSI (never raw upload)**
    *(high effort, high trust payoff).* "Who that I know is already here?"
    computed without Switchboard ever seeing your address book. Done right (PSI /
    secure enclave, not reversible phone-hashes) it becomes a marketing line — the
    anti-LinkedIn. See the trust note below.
11. **Two-way Google Calendar write of confirmed plans + push for live
    availability** *(medium–high).* Once a plan locks, write it as a real calendar
    event; use watch/push channels to keep availability fresh. The power-user
    upgrade beyond the read-only feed in #1.
12. **Embeddable RSVP/poll widget** *(medium).* Apple Invites' open-ended Link
    tiles accept any URL — so a Switchboard poll/availability widget can live
    *inside a competitor's event.* Be the sub-component others embed.

### The trap to avoid, which is also the biggest trust opportunity

Phone-number/address-book upload is the recurring trust catastrophe of this
category and the opposite of consent-first. LinkedIn's "Add Connections" import
led to a **$13M settlement** in *Perkins v. LinkedIn* — the harm wasn't the
import, it was the app acting *beyond* the consent given (follow-on reminder
emails in users' names)
([settlement](https://topclassactions.com/lawsuit-settlements/lawsuit-news/linkedin-reaches-13m-email-harvesting-class-action-settlement/)).
And naive hashing is *not* privacy: truncated SHA-256 of phone numbers is
trivially reversible (only ~10^10 possible numbers), which is how researchers
enumerated contact databases; real privacy needs Private Set Intersection or
secure enclaves ([Signal on private contact discovery](https://signal.org/blog/private-contact-discovery/)).
**Switchboard's move:** on-device matching, PSI, explicit per-action consent, no
reminder-spam-in-your-name — and say so loudly. This turns the category's biggest
liability into Switchboard's biggest trust differentiator.

### Why radical interoperability *is* the strategy

- **The moat is the graph, and interop feeds the graph — it doesn't leak it.**
  Every competitor hoards event data as its moat; that's backwards for a
  *connective* product. Switchboard's moat is the latent-plan / mutual-interest
  graph (who wants to see whom, who's free when, which cascades convert).
  Importing a Partiful link, reading a free/busy window, or mirroring RSVPs into
  Discord all *add edges to that graph.*
- **Interop-as-tool is the cheapest wedge into locked competitor bases.** You
  can't out-viral Partiful head-on, but every Partiful user has a plan trapped in
  a garden with only a read-only exit. "Paste your link, we'll make it calmer" is
  a *migration*, and migrations are how challengers beat incumbents.
- **"Meet users where they are" is literally the product thesis.** Real humans
  coordinate in iMessage, WhatsApp, Discord, and Google Calendar. Every friend
  forced to install an app is a dropped edge in the cascade. Web-RSVP, share-sheet
  invites, calendar feeds, and a Discord bot mean the *plan travels to the
  people*, not the reverse.
- **Neutrality is a differentiator rivals structurally cannot copy** — their
  business models depend on lock-in. Switchboard being the one place your
  scattered plans reconcile is a category the incumbents can't occupy without
  cannibalizing themselves.

> ### Hand-off Prompt 9 — Interop wave 1: calendar feed, add-to-calendar, OG, share
> ```
> Build Switchboard's first interoperability wave — the low-effort, high-leverage
> "make your existing life better" features. These make Switchboard useful even
> before a user's friends join, and make every shared link spread natively. Keep
> the calm copy voice.
>
> 1. Personal .ics subscription feed: a per-user, unguessable webcal:// URL
>    (token-based, revocable) that emits all of the user's upcoming Switchboard
>    plans as RFC 5545 VEVENTs. Add a "Add my plans to your calendar" control on
>    the profile/settings page with copy + a tap-to-subscribe link. Reuse the
>    existing ICS route patterns (src/app/api/events/[id]/ics).
> 2. Add-to-calendar on every plan: Google/Outlook/Apple/.ics buttons on the event
>    page and guest RSVP page (the calendar-links lib already exists — extend it).
> 3. Rich unfurling everywhere: add generateMetadata/openGraph to
>    src/app/events/[id]/page.tsx (currently missing — see the audit) using the
>    existing OG image route, AND emit schema.org/Event JSON-LD on event and guest
>    pages so links unfurl in iMessage/WhatsApp/Slack/Discord and are machine-
>    parseable by others.
> 4. Native share: use the Web Share API (navigator.share) with a copy-link
>    fallback for the guest link / cascade share actions, so inviting hands off to
>    iMessage/WhatsApp/SMS in one tap.
> Add unit tests for the feed generation and JSON-LD. Finish build/lint/test green
> with a summary. Do NOT add contact upload or any calendar READ in this wave.
> ```

> ### Hand-off Prompt 10 — Interop wave 2: import-from-competitor + smart windows
> ```
> Build Switchboard's second interoperability wave — the features that poach
> locked-in competitor users and add a signature consent-first capability. This
> wave involves external calls and OAuth; keep everything consent-gated, narrow-
> scoped, and degrade gracefully (mirror the app's existing AI-as-bonus pattern).
>
> 1. "Import an event from a link": paste a Partiful/Luma/Facebook/Apple-Invites/
>    Eventbrite URL; server-side fetch and parse Open Graph tags + schema.org/Event
>    JSON-LD (+ any linked .ics) into a prefilled event wizard. Handle failures
>    gracefully ("we couldn't read that link, here's a blank plan"). Respect
>    robots/ToS; frame strictly as user-initiated migration of their OWN event.
>    Add tests with fixture HTML from each source.
> 2. Google free/busy "smart windows": Sign in with Google (OIDC) requesting ONLY
>    the calendar.freebusy scope; use freebusy.query to return busy intervals and
>    suggest event times that avoid conflicts for the host (and, opt-in, for
>    invitees). Store NO event contents — only derived free/busy. Show the user
>    exactly what we can and cannot see ("we never read what you're busy with").
>    Make it fully optional; the manual date poll stays the default.
> 3. Sign in with Apple/Google + passkeys (WebAuthn) as calm, optional auth
>    methods alongside the existing magic link.
> Document the OAuth scopes and the privacy posture in docs/interop.md. Finish
> build/lint/test green with a summary. Defer PSI contact matching, CalDAV two-way
> sync, and the Discord bot to a later wave (note them as TODO in docs/interop.md).
> ```

---

## Part 9 — The operating system: how to run this project at a high level

You're directing AI agents to build a real app. The evidence says the speed
doesn't come from raw prompting — a rigorous 2025 RCT found experienced devs on
codebases they knew well were 19% *slower* with AI while *feeling* 20% faster
([METR](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)).
The speed comes from **the operating system around the agent**: specs, tests,
verification, structured planning. Here's that system, sized for a solo founder.

### The four disciplines

**1. Spec-driven development, not vibe-coding.** The spec is the primary
artifact; code is its expression. The lightweight version that fits a solo
founder: let Claude *interview you* about the feature (implementation, UX, edge
cases, tradeoffs), have it write a self-contained `SPEC.md` that names the files
and interfaces involved and ends with an end-to-end verification step, then start
a *fresh session* to execute it with clean context
([Claude Code best practices](https://code.claude.com/docs/en/best-practices)).
For bigger features, adopt GitHub's Spec Kit flow
(`/speckit.specify → clarify → plan → tasks → implement`)
([spec-kit](https://github.com/github/spec-kit)). The rule: **don't let an agent
jump straight to coding on anything non-trivial** — but skip the ceremony when you
could describe the diff in one sentence.

**2. TDD is the single strongest agent pattern.** Each red-to-green cycle gives
the agent unambiguous feedback. Because Claude defaults to writing implementation
first, prompt explicitly for a *failing* test first, and **commit the tests
before the implementation** so any test-editing "cheat" shows up in the diff
([best practices](https://code.claude.com/docs/en/best-practices)). Switchboard's
pure engine (`cascade`, `scoring`, `windows`) is already TDD'd — extend that
discipline to server logic.

**3. Context is the constraint.** Performance degrades as the context window
fills. `/clear` between unrelated tasks; delegate exploration to subagents that
report back *summaries* not raw file dumps; keep `AGENTS.md`/`CLAUDE.md` tight
(under ~200 lines — cut any line whose removal wouldn't cause a mistake)
([memory docs](https://code.claude.com/docs/en/memory)). Switchboard already uses
the correct bridge: `CLAUDE.md` imports `AGENTS.md`, and `AGENTS.md` carries the
one piece of non-inferable context that matters most — *"this is NOT the Next.js
you know; read `node_modules/next/dist/docs/` first."* Keep that pattern.

**4. Deterministic gates beat advisory rules.** Instructions in `AGENTS.md` are
requests; the things that *must* happen belong in enforcement: a CI pipeline
(build/lint/test/e2e) with GitHub branch protection so a PR can't merge red, an
AI code review + `/security-review` on every PR (critical for a Supabase app
where RLS mistakes are the classic footgun), and Vercel preview deploys per PR.
For a non-engineer founder, **CI is your last line of defense — not you.** (Part
2 already flags that there is no CI today; Hand-off Prompt 6 adds it.)

### The weekly cadence (discovery → plan → build → learn)

| When | Ritual | Output |
|---|---|---|
| **Mon AM — Discover** | One customer conversation using *The Mom Test* rules (ask about their past behavior, not your idea; people lie to be polite). Update the opportunity map. | `discovery/snapshots/YYYY-MM-DD.md` |
| **Mon PM — Plan** | Pick this week's bet from the "Now" column. Set an *appetite* (fixed time, variable scope — Shape Up) and write *kill criteria* in advance. Then spec it (Claude interview → SPEC.md). | `roadmap.md`, `specs/<feature>/spec.md` |
| **Tue–Thu — Build** | Explore → Plan → Implement → Commit per task; TDD; subagents for parallel investigation; one PR per task; CI + AI review + preview gate each PR. | merged PRs, green CI |
| **Wed (biweekly) — Brainstorm** | For any fuzzy problem: **diverge as a human first** (Crazy 8s / How-Might-We), *then* use AI to widen (SCAMPER, "10 wildly different ideas"), then converge yourself. | `brainstorms/<topic>.md` |
| **Thu (monthly) — Test** | Steve Krug's "a morning a month": 3 quick usability tests on the preview build; fix the top 3 issues. | notes → "Now" |
| **Fri — Learn & log** | Review analytics against the North Star; check kill criteria on active bets (cut or continue); write ADRs for decisions made. | `docs/adr/NNNN-*.md`, roadmap update |

The **circuit breaker** is the spine: if a bet isn't done when its appetite runs
out, it doesn't silently extend — you consciously re-bet or kill it
([Shape Up](https://basecamp.com/shapeup/2.2-chapter-08)).

### Why "diverge as a human first" matters for brainstorming

A 2024 *Science Advances* study found generative-AI ideas made individuals *more*
creative but made their outputs *more similar to each other* — individual
creativity up, collective diversity down, because the model hands different people
similar ideas ([Doshi & Hauser](https://www.science.org/doi/10.1126/sciadv.adn5290)).
The practical defense: do your own divergence *before* asking the AI, so your
ideas anchor the session rather than the model's mode-collapsed defaults; then use
AI to widen; then converge with human judgment. Don't treat the LLM like a search
box (question → one answer) during ideation — that collapses to generic output.
This is also how you protect Switchboard's distinct, calm brand voice: keep a
committed `docs/brand-voice.md` (3–5 voice adjectives translated into concrete
writing rules) that agents load when writing any copy.

### Research responsibly

AI research agents fabricate plausible-but-fake citations at scale — every URL and
statistic an agent hands you gets clicked and confirmed before it drives a
decision. (This very document was built by delegating research to agents and then
spot-verifying the load-bearing claims — the practice in action; a couple of
figures with source-to-source variance are flagged inline rather than asserted.)

### Repo artifacts to maintain (so agents have durable context)

```
/AGENTS.md              # agent operating manual (imported by CLAUDE.md) — keep tight
/CLAUDE.md              # @AGENTS.md + Claude-specific notes
/docs/brand-voice.md    # 3-5 voice adjectives -> concrete rules
/docs/adr/NNNN-*.md     # one file per architectural decision (Context/Decision/Consequences)
/roadmap.md             # Now / Next / Later (certainty horizons, not dates)
/specs/<feature>/       # spec.md (+ plan.md, tasks.md) — agent-executable
/discovery/snapshots/   # one-page interview notes
/brainstorms/<topic>.md # divergent-then-convergent session records
/docs/analytics.md      # every tracked event + why (from Prompt 7)
/docs/interop.md        # integration scopes + privacy posture (from Prompts 9-10)
```

Add a short "Spec-driven workflow" section to `AGENTS.md` so it becomes the
default posture every session (e.g. *"Every non-trivial feature starts from a spec
in `specs/<feature>/spec.md`; write failing tests first and commit them before
implementing; RLS must be enabled on any new Supabase table; before coding in
Next.js read the relevant guide in `node_modules/next/dist/docs/`."*). Because
`AGENTS.md` loads every session, this makes the operating system self-reinforcing.

> ### Hand-off Prompt 11 — Bootstrap the project operating system
> ```
> Set up the lightweight "operating system" scaffolding for the Switchboard repo
> so future AI-agent work is spec-driven, tested, and gated. Make only additive,
> low-risk changes.
>
> 1. Extend AGENTS.md with a concise "Spec-driven workflow" section: every non-
>    trivial feature starts from specs/<feature>/spec.md; write failing tests
>    first and commit them before implementing; RLS MUST be enabled on any new
>    Supabase table; before writing Next.js code read the relevant guide in
>    node_modules/next/dist/docs/. Keep AGENTS.md tight.
> 2. Create the artifact scaffolding with a README/template in each: docs/adr/
>    (Nygard 5-field template: Title/Status/Context/Decision/Consequences),
>    roadmap.md (Now/Next/Later), specs/ (spec template with User Scenarios +
>    Given/When/Then acceptance + measurable Success Criteria + a Verification
>    step), brainstorms/, discovery/snapshots/, and docs/brand-voice.md distilling
>    Switchboard's calm/consent-first voice into 3-5 adjectives and concrete
>    writing rules (no emdashes, no hedging, no urgency/streak language).
> 3. Add a GitHub Actions CI workflow (if Hand-off Prompt 6 hasn't already) that
>    runs npm ci, lint, build, test, and e2e on every PR, and document the branch-
>    protection settings to enable (required checks before merge).
> 4. Write the first ADR (docs/adr/0001-design-system.md) recording the actual
>    shipped design system (pink/Work Sans) vs the stale terracotta docs, so the
>    decision history is captured.
> Finish with build/lint/test green and a summary. This prompt creates process
> scaffolding, not product features.
> ```

---

## How to sequence all of this

The engineering phases (Part 3) still come first — **security before anything
touches real users.** Overlay the strategy work like this:
- **Alongside Phase 2–3 (UX/realtime):** Hand-off Prompt 8 (activation onboarding
  + recap loop) and Prompt 7 (analytics/North Star) — you want to be measuring the
  right things before you grow.
- **Phase 4 (hardening) absorbs** Prompt 11 (operating-system scaffolding, incl.
  CI) and Prompt 9 (interop wave 1 — calendar feed, add-to-calendar, OG, share:
  all low-effort, high-leverage, and they make every existing user more useful).
- **Phase 5+ (differentiation):** Prompt 10 (interop wave 2 — import-from-
  competitor + free/busy smart windows + passkeys), then the deferred interop
  (PSI contact matching, Discord bot, two-way calendar), then the design-identity
  commitment from Part 5.

The through-line: fix what's broken, measure what matters (real gatherings, not
screen time), become the calm layer that reads and writes to every other app, and
never add a mechanic that would make Switchboard the kind of app it exists to
replace.

---

## Appendix B — how this strategy section was built and verified

- The competitive/interop, humane-engagement, and workflow research was gathered
  by delegated research agents against current (2025–2026) web sources, then the
  load-bearing claims were checked against the cited primary pages. Every
  substantive claim links its source inline so it can be re-verified.
- A few figures carry known source-to-source variance and are flagged where they
  appear (e.g. BeReal's peak users and the Voodoo acquisition price quoted as both
  €500M and ~$537M). Vendor-reported benchmarks (e.g. AI-code-review catch rates)
  are treated as directional, not precise.
- The METR "19% slower" finding is robust but narrow (experienced devs on mature
  codebases, early-2025 tooling); it argues for a disciplined operating system,
  not against using agents.
