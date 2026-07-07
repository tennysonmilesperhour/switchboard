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
