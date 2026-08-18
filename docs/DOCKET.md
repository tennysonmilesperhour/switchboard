# Switchboard Docket

A living backlog of shipped work, queued builds, and design threads captured
from working sessions. Newest thinking lives here so nothing evaporates.

> Legend: ✅ shipped · 🛠️ queued to build · 🎨 in design / workshop · 💭 idea ·
> 🔧 ops (needs the owner or a dashboard, not code)

---

## 🧹 2026-08-11 consolidation — what moved, what shipped, what's still open

The point-in-time plans and audits were archived to `docs/archive/` (they had
drifted badly — all three client-feedback plans still said "nothing implemented
yet" while their features were live in the app). This docket and
`docs/WEEKLY-PLAN-2026-08-11.md` are now the only places describing work not
yet done. This section carries forward every still-open item found in the
archived docs so nothing evaporates with them.

### ✅ Shipped 2026-08-12 (the weekly plan, executed)

Private zones with an owner-managed roster, join links, and request-to-approve;
a host Privacy & access panel that makes the three event visibility flags
editable after creation; poll trees (a follow-up opens by itself when its
parent is decided) plus the suggest-deadline sweep that makes that long-stored
setting real; the feature passport on `/features`; and appearance presets
(Almanac, Dusk, Transit) with a contrast-checked token layer. Home now leads
with four equal pillars. `docs/NAMING.md` is the naming checklist — its
**decide** rows are the open work there.

**Needs Docker before production:** `supabase test db` for
`private_zones.test.sql` and `poll_trees.test.sql`, then apply migrations
`20260812120000`, `20260812130000`, `20260812140000`.

### ✅ Verified shipped since the sections below were written

Client-feedback rounds 1–3 (archived plans) are implemented: decline-with-a-note
+ guest parity, Family & Kids interests, welcome/onboarding trim, the
getting-started checklist, board offers/requests with responses and editing,
rooms inbox (activity sort, unread `last_read_at`, sections, filter),
room-message notifications, settings save contract (typed success/failure),
permanent plan deletion, clickable host invite link, 18+ terms acceptance,
verified contact records, and per-event themes with a wizard picker. The
feature index (`/features`, `src/lib/features.ts`) plus its test now guard the
catalogue of what exists.

### 🛠️ Still open — **each line re-verified against the code 2026-08-12**

The 2026-08-11 consolidation verified the *shipped* list but carried this
*open* list forward on the archived docs' word. Two of its items were already
built, which is the same drift the consolidation existed to end. Every line
below has now been checked against the source; the check is named so the next
reader can redo it in one command rather than trust this file.

- ✅ **Already done — Give Space invariant.** It *is* in `docs/SECURITY.md`
  (§"Give Space safety invariant"). The claim that it was "never written" was
  wrong.
- ✅ **Already done — custom emoji + label signals** (round 2, 6c).
  `SignalBar` has the emoji field and "Add your own status…" input.
- ❌ **"Give Space doesn't filter" was never a gap** (round 2, 4b) — struck, and
  this entry kept so it is not raised a fourth time. It read as unfinished work
  and it is the design, stated in three places: the `profile_avoids` migration
  ("the guiding rule is **warn, never remove**"), `giveSpace` in
  `src/lib/actions/connections.ts` ("it never removes anyone from anything"),
  and the shipped entry lower in this very file ("Guardrail held: warn, never
  remove"). This file was arguing with itself — one line called filtering
  missing, another called *not* filtering the guardrail being upheld.
  The map was not a judgment call either. `SECURITY.md` permits an avoid to
  "filter or privately annotate" — permissive, an upper bound, not a
  requirement — while forbidding it to "appear on a map, zone, moment, or other
  location surface", which rules out both filtering *and* warning there. Reading
  those two clauses as competing was the error; the location clause is an
  absolute carve-out that applies to every use of an avoid.
  Making Give Space filter would be a **product decision to make it more like a
  block**, not a safety fix. It would need the three statements above changed
  first, and the `zone_presence` count semantics settled — shrinking a shared
  count is observable by the person being avoided, which is the one thing the
  feature exists to prevent.
- ✅ **The real Give Space gap, now closed.** The control lived only in
  `/people`, which lists people you are *connected to* — so the person most
  worth avoiding, someone you are not friends with who keeps turning up on your
  plans, was the one person you could not avoid. The event page's heads-up only
  fires for someone already on the list, so they could never trigger a warning
  either. `GiveSpaceButton` now sits on any profile.
  A "who can see me right now" screen (4c) is separate and still open.
- ✅ **Signal rings on avatars** (6a). `Avatar` takes an `AvatarSignal` and
  draws a sage ring plus the signal's own emoji, with the label as screen-reader
  text so the ring never carries meaning by colour alone. Fed by
  `loadVisibleSignals`, which reads through the **viewer's own client** so the
  audience rule stays in the `signals_visible` policy rather than being copied
  into TypeScript. Live on `/people`.
- 🛠️ **Daily digest** (6b). Confirmed unbuilt: "digest" appears in
  `notify.ts` only in comments. Needs a cadence decision.
- 🛠️ **Message full-text search** (5c stage 2). Confirmed unbuilt — no
  `textSearch`/`websearch` anywhere. RLS-scoped, never the admin client.
- 🛠️ **Availability Heatmap → AWI poll** (2a; `INNOVATIONS.md` #8). Confirmed
  unbuilt. Only after it proves out: **read-only Google free/busy** (2b).
- ✅ **Post-level reporting** into the moderation queue (round 1, Phase 3).
  `user_reports` gained `target_kind`/`target_id` rather than getting a parallel
  table, so the existing resolution tracking, `platform_moderators` authority,
  and security-definer accessors all keep working — one queue, one resolution
  path. `list_open_reports` now carries the post's own **text** (not a link), so
  a post deleted between report and review does not leave a moderator with
  nothing to judge. A "report" control sits on every board post that is not
  your own. Covered by `supabase/tests/post_reports.test.sql`.
- 🛠️ **Board announcement → a real scoped plan** ("Make this a plan", N14).
  Confirmed unbuilt.
- 🛠️ **Kids-welcome event attribute + host checklist** (round 3, slice 3).
  Confirmed unbuilt, and deliberately gated on public event discovery existing.

### 🔧 Ops residuals, carried from the audits and ship checklists

Code can't close these; they need the owner or a dashboard:

- Enable **leaked-password protection** in Supabase (last open security
  advisor).
- **Provider config**: Resend email (`RESEND_API_KEY`/`EMAIL_FROM`), Twilio
  phone verification (all four vars), or set pilot expectations without them.
- **Cron plan**: Vercel Pro for the every-minute sweep, or an external
  scheduler with the `CRON_SECRET` bearer.
- **Preview environment isolation** (own Supabase project, complete config) and
  confirming the **authed-E2E GitHub job is a required check**.
- ~~**CI on `main` is red**~~ — **root cause found and fixed 2026-08-12**
  (PR #136, merged). The invite journey passes again; one unrelated failure
  remains, see the end of this entry.

  The Authenticated E2E job had been red on every push since **2026-07-31**
  (not Aug 7 as first recorded — run 281 shows it red on the very commit that
  added the invite test, so that test never passed once).

  **The cause was a missing grant on the *private* function bodies.**
  `20260717192758_move_definer_bodies_private.sql` moved every authenticated
  `SECURITY DEFINER` body out of `public` into `private` and left a thin
  `SECURITY INVOKER` wrapper behind. `alter function ... set schema private`
  **carries the function's ACL with it**, so each body kept its `authenticated`
  grant and never gained one for `service_role` — only the five *trigger*
  functions got an explicit grant, because only that branch of the loop said so.

  An invoker wrapper runs as its caller, so the caller needs EXECUTE on the body:

      authenticated → wrapper runs as authenticated → body allows → works
      service_role  → wrapper runs as service_role  → body denies → 42501

  32 private bodies were in that state. Nothing failed at migration time
  (migrations don't run as `service_role`), so only the handful of paths that go
  through `createAdminClient()` broke — and they broke for real people:

  - `is_event_host` — every host-only action routed through `isEventManager`:
    inviting directly, cascade edits, closing a poll, announcements. Hosts were
    told *"Only the host can invite people to this plan."*
  - `resolve_parental_approval` — shipped 2026-08-11 granting `anon` and
    `authenticated` but never `service_role`, and only ever called as admin, so
    a guardian following an approval link could not approve. Same hole, found
    while fixing the first.

  Proven from the CI server log, not inferred:
  `{"area":"authz.event-manager","userCode":"SB-PLAN-AUTHZ","message":"permission
  denied for function is_event_host","code":"42501"}`.

  **Three false starts worth remembering**, all corrected by evidence:
  a local Postgres replica twice said `service_role` *could* execute the
  function — its default privileges were more generous than real Supabase, so
  the replica exonerated the true cause until it was rebuilt to rely on the
  implicit PUBLIC grant the way Supabase does. The shared shape of the two
  failures pointed convincingly at the session-rotation race the spec file
  documents. And the first fix granted the *public wrapper*, which made pgTAP
  pass while the app still got 42501 — the wrapper was never the problem.

  **Fixed by:** `20260812150000_service_role_function_grants.sql` (grants the
  private bodies to `service_role` only; `private` stays unreachable from the
  browser and `public`/`anon` stay revoked), a three-way authz result
  so a check that cannot run is `SB-PLAN-AUTHZ` rather than a false accusation,
  and retained Playwright traces/screenshots on failure — the absence of any
  artifact is why this went two weeks unexplained.

  **The rule it leaves behind:** default privileges no longer grant EXECUTE to
  PUBLIC, so **any function called through `createAdminClient()` needs an
  explicit `grant execute ... to service_role`**.
  `supabase/tests/service_role_grants.test.sql` asserts that for every such
  function — *including the private body behind an invoker wrapper*, and as a
  general rule over the whole `private` schema, so the next function moved
  cannot repeat this.

  **Confirmed by CI:** with the grant in place, `authed.spec.ts:345` (the invite
  journey) passes and no `42501` appears in the server log. 8 passed, up from 7.

  **Still open, and unrelated:** `authed.spec.ts:278` "a host opens a group
  decision, suggests, and votes" — after adding a suggestion, `Tacos` never
  renders. **Not** a permission problem: replaying the exact scenario against a
  full local schema (host, `deciding` plan, `suggesting` poll) gives
  `can_view_event = true`, `is_event_host = true`, and the `poll_options`
  insert succeeds under the host's own RLS. The selector is right too — there
  is exactly one `Add` button on that page. So the insert either fails for a
  reason the page states in a `role="alert"` nobody was reading, or it succeeds
  and the list never re-renders. The test now quotes the app's objection (or
  says explicitly that there wasn't one), which separates those two on the next
  run.
- Legal copy sign-off; run `supabase test db` + the `E2E_DB=1` suite once
  against a disposable project before any release.

### 💭 Deferred epics still parked (from the archived strategy docs)

Interop wave 2+ (import-from-link shipped; PSI contact matching, Discord bot,
two-way calendar write remain), OAuth/passkeys, i18n, businesses in Explore
(N13), the adventure game (N12 — the 2026-08-11 weekly plan's feature passport
is its first intrinsic step), collaborative playlist / shared album / weather
embeds / plus-ones (Partiful-gaps leftovers), and `polls.suggest_deadline` is
vestigial — drop it in the next poll migration (the poll-tree work is the
natural moment).

---

## 🧭 Strategy (the frame for everything below)

**Launch city: Salt Lake City.** Still open: who are the first 100 users, and
what do they open the app to do on day one?

**The ~dozen ideas collapse into three primitives.** Most of the backlog is one
of these wearing a costume — build each once, surface it everywhere:

1. **A reachability policy** — *who can reach me, and on what terms.* Powers
   connect-tiers, the ex-filter, Moments gates-with-exceptions, mutual reveals,
   and get-to-know-you prefs. One engine, many surfaces.
2. **The geo foundation** — opt-in device location + real coordinates. The
   keystone under the map, Moments proximity, public events, verified-presence
   Zones, and Adventure Mode. Nothing spatial exists until it's poured.
3. **Engineered serendipity** — make real-world encounters happen *without
   pressure*. The app's soul: meetcute → Moments → Adventure Mode → the map.

**The strategic fork to decide, not drift through.** PRODUCT.md is emphatic —
no manipulative growth loops, no status games, not a generic feed, privacy
first. The points / tiers / public rankings / merchant-funnel / business-ads
cluster pulls the *opposite* way from the intimacy that makes Switchboard
different. Either (a) keep that layer late and strictly intrinsic (private
progress, delight, invitations as reward — never pressuring leaderboards), or
(b) consciously become a more commercial "things to do near you" product with
intimacy as a feature. Both valid; drifting between them is the risk.

**The existential gaps no feature addresses yet:**
- **Cold-start / density.** Map, proximity, matching, Adventure Mode are all
  worthless at low density and magical at high. What's valuable to the 30th
  person in SLC before the 3,000th arrives?
- **Three products in one.** Intimate coordination (cascade/circles) vs
  stranger-serendipity (moments/map) vs local-business marketplace (Explore).
  Different users, different trust. **Which is the wedge?**
- **Physical-stakes safety.** Routing strangers together is a different
  liability universe than a chat app. T&S, verification, moderation.
- **Staying calm.** Streams + pings + quests + reconfirms can become the noisy
  attention-machine the app is running *from.* "Calm" is a design constraint.
- **Business model.** B2B, transactional, or subscription? Undecided; it
  bounds what Explore may become.

**Recommended sequencing.** Two tracks: (1) keep polishing the intimate core
loop — already differentiated, works at *any* density (even two friends); this
is the wedge unless decided otherwise. (2) Pour the geo foundation
deliberately; treat map/serendipity/business as *expansion* gated behind
density + safety, not the next sprint.

---

## ✅ Shipped (PR #36 — branch `claude/feature-ideas-suggestions-iic2b0`)

- **Opt-out host suggestions** on the plan review step. Pure, unit-tested rule
  engine (`src/lib/engine/suggestions.ts`) that flags a too-short response
  window ("don't give people only 15m"), a cascade that runs past the start, a
  window closing after the start, a missing date, and a missing location.
  Toggleable off (localStorage, reversible), dismissible, silent when healthy.
- **Circles are a real management view** (`/people`). Open a circle → see
  members → add/remove → rename/delete. New owner-scoped `renameCircle` /
  `deleteCircle` actions; editable emoji.
- **Date/time fix** in the plan wizard — fields stack on mobile (no more
  overlap), time steps in **5-minute** increments.
- **Faster invitee selection** — circles + households as one-tap group chips,
  collapsible friends list (auto-collapses past 12), smaller two-column cards,
  and a **Custom…** response-window option (any minutes/hours/days).
- **Calendar as a photo grid** — new `tile` PlanCard variant shows the event
  cover near full-strength; "Coming up" (Waiting-on-you / Hosting / Going) is a
  two-column grid of those tiles instead of long horizontal cards.
- **"Add your own" in the interest/activity picker** — `InterestPicker` now
  takes free-text custom values (interests + "down to", in Settings/Onboarding).
  First cut of the global "custom answers everywhere" principle.

### Shipped (follow-up PR, off updated `main`)

- **Settings save bar.** Editing any section on `/settings` raises a single
  floating **Save changes / Cancel** bar (`SettingsSaveProvider` +
  `SettingsForm` in `src/app/settings/SettingsSaveBar.tsx`). Each section
  registers as a participant; Save fans out to every dirty section's server
  action at once, Cancel reverts them (native inputs and `InterestPicker` reset
  by remounting to their last-saved values). Notification toggles defer through
  the same bar instead of writing on each tap. `InterestPicker` still emits a
  synthetic `input` event so chip changes register as unsaved.
- **Intent launchpad** (`/create`). The broad "what kind of thing is this?"
  layer before the wizard: *I've got a plan* → wizard; *Help me figure it out*
  → wizard with poll/`deciding` pre-enabled (`?decide=1`); *Find something to
  do* → discover. Primary create CTAs (FAB, home, empty states) repoint here;
  prefill deep-links still go straight to the wizard.

---

## 🛠️ Queued to build

- **Post-send cascade editing.** ✅ *shipped.* `CascadeProgress` (host live
  view, already did remove/resend) now also lets the host **reorder** the queued
  line (individual mode) and **change a queued invite's response window**. Two
  security-definer functions (`move_queued_invite`, `set_invite_window`) —
  host-checked and queued-only, so history can't be rewritten. Hardened for
  concurrency after an adversarial review: a per-event advisory lock plus
  `FOR UPDATE` row locks serialise edits against each other and the cascade
  cron, and the window change is an atomic `WHERE status = 'queued'` update.
  Remaining ideas: consequence-aware actions for *live* invites ("skip to
  next", "cancel this one"). Earlier scope note: reorder/add/remove/adjust; the
  remove, adjust windows); handle already-sent/accepted invites with explicit,
  consequence-aware actions ("skip to next", "cancel this invite"). Note the
  `position` unique constraint needs careful renumbering; host/co-host only.
  `AddInvitees`/`HostControls` may already cover part of the "add" path — scope
  before building.
- **"Describe it for me" is weak.** It's AI-backed (`parsePlan` → Claude) with a
  title-only no-key fallback — so if `ANTHROPIC_API_KEY` isn't set on the
  deployment it silently degrades. Fix: (1) confirm/wire the key, (2) strengthen
  the prompt + add a "here's what I understood" confirm step.

---

## 🎨 In design / workshop

- **Custom answers everywhere (rollout).** Flagship done (`InterestPicker`).
  Extend the same "add your own" affordance to the remaining preset pickers:
  discover budget/vibe/group-size chips, matchmaker `ACTIVITY_PRESETS`, moment
  experiences, poll options (already custom). Principle: any fixed list gets a
  free-text escape hatch.
- **Zones: richer curation + presence-gated announcements.** Give zone
  organizers more detail fields, plus a comment/announcement layer (reuse the
  Boards post pattern) **gated to people who are both checked in *and* verified
  physically present** via location sharing (optional). Needs a zone check-in
  concept + the geo foundation for the presence check.
- **Moments: a real filter/gate system.** On opening Moments, surface far more
  preset filters + general presets. Add *negative* filters ("what I don't
  want") with **exceptions/overrides** — e.g. "don't talk to me *unless* we're
  already friends / from the same city / share preference X." This is a small
  rules engine (deny-by-default gates + allowlist exceptions); overlaps the
  ex-filter and get-to-know-you preference model. Keep it private + easy.

- **Connect-request context layers.** When sending a request, pick a *closeness
  tier* (acquaintance → friend → close) the recipient sees as soft framing, plus
  optional *shared-activity chips* that only reveal on mutual match (reuse
  `mutual_intents`), plus an auto-computed "why you know each other" line. Open:
  is the tier a visible proposal, private sort (Circles already do this), or
  mutual-gated? Frame labels upward so no one feels ranked.
- **"Confirmed in theory" (soft yes).** A `commitment` flag on an accepted
  invite: `tentative` (mint 🖊️) vs `firm` (green ✅). A reconfirm ping rides the
  existing ~3h reminder sweep; one tap upgrades mint→green. Host sees the split
  ("6 locked in · 4 pencilled"). Rule: never auto-drop a non-reconfirmer.
- **Spaces / verified-join communities.** Boards already exist (invite-only
  local groups w/ notices + events + RLS). The gap is *self-serve join via
  verification*: start with join links/codes + request-to-approve; email-domain
  and address-radius later. Second gap: board events are notices, not real
  plans — spawn a real event scoped to the board.
- **"Ex-filter" / give-me-space.** ✅ *v1 shipped* — `profile_avoids` (mirrors
  `profile_blocks`), `giveSpace`/`stopGivingSpace`, a "Give space" control on
  each person in `/people`, and a private heads-up on the event page when an
  *already-visible* avoided attendee is going (never computed against hidden
  guest lists, so it can't be an "is X going?" oracle). Guardrail held: **warn,
  never remove**; invisible to the other person. Setting "give space" from a
  public profile / on non-friends is now done (`GiveSpaceButton`).
  *Remaining:* the host-private "these two don't mix" note for guest-list
  hygiene; fold into the shared reachability engine.
- **Get-to-know-you games.** Solo / duo (reveal simultaneously, like mutual
  intents) / group icebreakers. Doubles as a sensor that enriches matching.
  Model: explicit interests (shared/editable) vs private inferences (tune-only,
  never shown). Optional **mic** input — transcript-only + on-device + discard
  audio by default; duo needs both people's consent.
- **Businesses in Explore.** Let claimed/verified businesses publish *prebuilt
  experiences* that surface as first-class results in "find something great,"
  matched to the user's query (not blasted), clearly labeled. Killer CTA:
  **"Plan this"** → pre-fills an event → invite your crew (drives *group*
  bookings, keeps users in the social loop). Builds on `venues` (claimable +
  perk) and the Claude discover flow. Guardrail: compete on *fit + quality*, not
  paid placement — Explore must never become a "who paid most" feed
  (PRODUCT.md anti-reference).

---

## 💭 The visual epic (the stated top priority)

Move away from numbers/icons toward something spatial and intuitive.

- **Geo-tagged, opt-in-public events** (esp. recurring) — the foundation. Events
  today have only a text location; no coordinates, no public flag, no map.
- **Opt-in device location** — the app has never used `navigator.geolocation`.
  First consumer: a **proximity slider in Moments** ("proximity of willingness")
  beside the existing time slider, filtering by distance from me. Needs
  coordinates on moments (today just a text `place_name`) + location-sharing on.
  Show "within X mi", never anyone's exact pin.
- **Dashboard = two living streams** — *Around me* (locality + interests,
  calendar-aware) and *Your people* (friends' public plans, who's down to hang).
  Raw material exists: signals + discovery.
- **Lens toggle: Map / List / Surprise-me** — same data, three brains.
  Surprise-me = an Adventure-Challenge card ("tonight: dress like X, bring $20").
- **Image-based themes** — a curated gallery; a full-bleed image replaces the
  white background. Also the reward surface for →
- **The adventure game** — challenges → golden points → tiers that restyle the
  app → merchant perks (free-scoop loss-leader) → owner-hosted tier events.
  Guardrail: build the *intrinsic/delight* version, not leaderboards/streak-guilt
  or spend-funnels (PRODUCT.md anti-reference: no manipulative growth loops).

### The serendipity engine (the ambitious one)

**Adventure Mode for Zones** — dispatch N people into a zone, each with a
*different* quest/task series, choreographed so their paths converge and they
"bump into" each other. This is the meetcute matchmaker (very first idea of the
session) at zone scale, with the quest as the cover story. Four layers: Zones
(exist) → geo foundation (locate people, place waypoints) → a quest engine (a
distinct path per person) → orchestration that lays the paths to intersect (the
hard routing/scheduling problem). The reveal rides Moments' three-moments-of-
consent. **Highest-trust surface in the app:** opt-in only, busy/public venues,
playful quests, consented reveal, one-tap exit. Feeds the challenge/tier game.

Privacy spine for all of the above: public = opt-in *per event*, the map shows
*events people chose to share* (never live people), "down to hang" stays
circle-scoped. Anything that steers people physically toward each other is
opt-in and consent-gated, always.

*(Open threads still to hear back on: SLC Lunatics — the story got cut off.)*
