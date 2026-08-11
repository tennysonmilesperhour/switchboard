> **Archived 2026-08-11.** This plan was executed: the decline note, Family &
> Kids interests, welcome trim, getting-started checklist, and board
> offers/requests all shipped. The "nothing here is implemented yet" line below
> is preserved as written but no longer true. Still-open Phase 3 items are
> carried forward in [`../DOCKET.md`](../DOCKET.md).

# Client Feedback Review & Implementation Plan

*Product / UX / architecture review of five pieces of client feedback, grounded in
the current codebase. Planning only — nothing here is implemented yet.*

---

## 1. The underlying user problems (separated from the proposed solutions)

| # | Client ask | Actual underlying problem |
|---|---|---|
| 1 | "Communicate with the host of an invitation" | Declining feels socially costly. A decliner wants to **protect the relationship** — say *why*, and signal "ask me again." The host wants to know a decline wasn't a rejection. Nobody asked for a chat app; they asked for one sentence of context. |
| 2 | "Requests in addition to offers" | Temporary, low-stakes neighborly exchange ("who has a knee scooter?") has no structured home. People need to **broadcast a need to a trusted group and close the loop** when it's met. |
| 3 | "Kid-inclusive interests" | Parents and caregivers can't express the way they actually socialize — **with children along** — so matching and suggestions miss them entirely. |
| 4 | "First page felt busy" | The introduction **explains too much before letting the user feel anything**. Copy volume + parallel choices + internal jargon ("Anonymous Weighted Input") obscure a simple promise. |
| 5 | "A short tutorial" | New users don't know **what to do first**. That's an orientation problem — a tour is one possible treatment, and not the best one here. |

---

## 2. Current-state assessment (what the codebase actually contains)

### Invitations & RSVP
- `invites` already carries a **categorical decline reason**: `decline_note check (decline_note in ('keep_asking','not_my_thing'))` (`supabase/migrations/20260703120000_init.sql:147`). The member decline UI (`src/components/events/RsvpCard.tsx:90-117`) already asks *"No problem — which is it?"* with **"Can't this time — keep asking! 💛"** and **"Not really my thing."**
- **"Please invite me next time" is already built end-to-end for members**: run-it-back event cloning re-invites `keep_asking` decliners and filters out `not_my_thing` (`src/lib/actions/events.ts:1067-1088`).
- The gaps: no free-text field anywhere in the decline flow; the **guest** RPC `respond_to_guest_invite` takes no reason at all (`supabase/migrations/20260717081000_restore_event_room_membership.sql:71-136`); **hosts are never notified of declines** (only `rsvp_accepted` exists — `src/lib/actions/invites.ts:105-111`); the host-side `CascadeProgress` shows only a small `· "ask me again!"` tag (`src/components/events/CascadeProgress.tsx:206-208`).
- There is **no DM primitive, deliberately**: ad-hoc room creation was removed as an anti-harassment measure (`supabase/migrations/20260712120000_authz_hardening.sql:68-79`); rooms only come into existence bound to an event, match, or moment, and event-room membership is accept-gated.

### Offers, requests, boards
- Neighborhood **boards** are invite-only, member-gated groups with a post model: `board_posts.kind check (kind in ('notice','event'))` (`supabase/migrations/20260704160000_neighborhood_boards.sql:22-33`), a working composer with a kind toggle (`src/app/boards/[slug]/BoardClient.tsx:182-202`), RLS helpers (`is_board_member`, `is_board_moderator`), moderator roles, invite links, and author/moderator delete.
- The request use case already happens **as unstructured text**: the notice composer's placeholder is literally *"Anyone have a ladder to lend?"* (`BoardClient.tsx:212`).
- Missing: any offer/request structure, a fulfilled/claimed state, expiry (`board_posts` has no `expires_at` and is outside the cron sweep), **any way to respond to a post in-app**, board notifications, realtime, and content-level reporting (`user_reports` targets users, not posts).

### Interests & activities
- The taxonomy is a constants file, `src/lib/interests.ts` — 12 categories, ~130 options, plus `DOWN_TO_GROUP` (15). **Zero kid/family/caregiver entries exist anywhere** (whole-repo search).
- Storage is open `text[]` on `profiles` (`interests`, `down_to`); the `InterestPicker` already accepts free-typed custom values, so parents may already be typing these in unmatched. Matching everywhere is exact-string set intersection (`list_discoverable_people`, `find_nearby_people`, mutual `activity =` equality, compatibility engine) — **new labels match instantly with no migration**.
- Events have **no tag/category/attribute system at all** (only the visual `theme` enum and `open_table` boolean), and no browse/filter surface where a "kid-friendly" filter could act. The `households` table exists but is unused by any code.

### First screen & onboarding
- `/welcome` (`src/app/welcome/page.tsx`): hero ("Make plans. / Like magic.") + **six feature cards** totaling ~130 words of the page's ~220–240, using internal feature names ("Anonymous Weighted Input", "Cascading Invites").
- Onboarding (`src/app/onboarding/OnboardingForm.tsx`) is **one long required page**: name, handle, a 12-category/~130-chip interest grid, a 15-chip down-to grid, a ~75-word circles explainer, and the covenant block with two checkboxes. No steps, no skip.
- Logged-in home (`src/app/page.tsx`) stacks up to 12 sections; a brand-new user still sees ~130–160 words plus 8 signal chips, 6 idea chips, and ~5 action cards.
- **No tour/tooltip infrastructure exists.** The established guidance patterns are: live-data-driven empty states (the `friendCount === 0` gold card) and four dismissible localStorage nudges (`sb-*` keys). Completion flags live as typed columns on `profiles` (e.g. `onboarded`).

### Shared infrastructure new features can ride
- One generic notification write path: `notifyUsers()` (`src/lib/server/notify.ts:32-65`) → durable in-app row + preference/quiet-hours-gated web push; new kinds just register in `KIND_TO_CATEGORY` (`src/lib/notifications.ts:83-105`).
- Read-time expiry filtering + a single per-minute cron sweep (`src/app/api/cron/cascade/route.ts`).
- Analytics conventions: 5 server-side events in `src/lib/analytics/events.ts`, hard guardrail of **never capturing content**.
- Security precedents (`docs/SECURITY.md`): RLS on everything, UPDATE policies need `WITH CHECK`, ownership columns frozen, definer functions re-check `auth.uid()`.

---

## 3. Decision table

| # | User problem | Options considered | Recommendation | Product value | Effort | Dependencies & risks | Timing |
|---|---|---|---|---|---|---|---|
| 1a | Decliner wants to explain + stay invited | RSVP message · quick reasons · "invite me next time" · private DM · chat thread | **Optional ≤280-char note on decline**, layered on the existing `keep_asking`/`not_my_thing` chips; guest-link parity; host sees it (notification + cascade view) | **High** — protects relationships in the core loop; the loop is 80% built and just needs completion/surfacing | **Small–Medium** | Touches two SECURITY DEFINER RPCs (overload cleanup needed); mild notification-noise risk (mitigate: notify only when a note is attached) | **Now** |
| 1b | (same) | Full 1:1 messaging / chat with host | **Do not implement.** DM-lessness is a deliberate anti-harassment stance (`authz_hardening.sql:68-79`); a one-shot note solves the stated need without an abuse surface, unread states, or moderation burden | Low incremental over 1a | Large | Would reopen consent/abuse questions the product intentionally closed | **Do not implement** |
| 2a | Broadcast a temporary need to trusted people; close the loop | New marketplace product · distinct post types on boards · unified composer w/ selector · stay unstructured | **Extend `board_posts` with `offer` + `request` kinds** (the composer's kind toggle *is* the unified selector), plus `expires_at`, fulfilled state, and a one-tap **"I can help"** response that notifies the author | **High** — makes boards useful weekly, not just at move-in; validated by the placeholder text already anticipating it | **Medium** | Boards need enough members to answer (density risk — invite-only scope is the mitigation, not a flaw); no content-level reporting yet (2c) | **Next** |
| 2b | Borrow coordination (returns, deposits, handoff) | Return tracking, deposits, condition photos, coordination chat | **Do not implement.** Invite-only boards are high-trust; author + helper already share a community. Coordination happens as it does today; add a one-line "arranged between neighbors" disclaimer | Low; high complexity + liability surface | Large | Deposits/returns imply platform liability and dispute handling | **Do not implement** (revisit only with evidence) |
| 2c | Post-level abuse handling | Per-post reports · rely on user reports | Add **post reporting into the existing moderation queue** once offers/requests ship | Medium (safety hygiene) | Small | Piggybacks `user_reports` + `platform_moderators` queue | **Later** |
| 3a | Caregivers can't express kid-inclusive socializing | New interest bubbles · event attribute · both | **Add a "Family & Kids" interest category** (+ 2–3 `DOWN_TO_GROUP` / `ACTIVITY_PRESETS` entries), inclusive caregiver-neutral labels | **Medium-High** — zero-migration, instantly powers matching/discovery/AI suggestions; removes an exclusion signal | **Small** (hours) | Additive only (renames orphan stored strings — `interests.ts:12-14`); selecting these discloses caregiver status to discovery (already gated by `discovery_interests` opt-out) | **Now** |
| 3b | Mark an *event* as kid-friendly | `kid_friendly` boolean / `tags text[]` on events + wizard field + filters | **Defer.** Events have no attribute system or browse/filter surface for it to act on; plans are invite-only, so hosts already tell their invitees in the description. Build it when public/discoverable events (the geo epic) exist | Low today, real later | Medium | Premature generalization; would add a wizard field with no consumer | **Later** |
| 4 | First screen overwhelms | Trim copy · restructure hierarchy · progressive disclosure · reduce choices | **Copy + IA pass on `/welcome`** (6 jargon cards → 3 benefit lines, ~240→~120 words) and **lighten onboarding** (2 light steps; interests "pick a few, add more later"; explainers cut to one line) | **High** — first-impression conversion; prerequisite for deciding on any tour | **Small–Medium** | Covenant checkboxes are a legal artifact — shrink surrounding prose, don't remove consent; copy is cheap to A/B | **Now** (welcome) / **Next** (onboarding) |
| 5a | New users don't know what to do first | Multi-step tour · tooltips · empty states · checklist · nothing | **A live "Getting started" checklist card on Home** (add a friend → set a signal → float a plan), computed from real data like the existing gold card, dismissible via the `sb-*` pattern, reopenable from Settings | **Medium-High** — teaches by doing, self-retires, fits the "calm" constraint | **Small** | Do after the item-4 trim so it isn't one more card on a busy screen | **Next** |
| 5b | (same) | First-launch modal walkthrough / coach marks | **Do not build now.** No tour infra exists; modal tours get skipped, age badly, and would paper over the real problem (item 4). Revisit only if post-simplification funnel data still shows drop-off | Low until proven otherwise | Medium | Competes with simplification for the same outcome | **Do not implement** (re-evaluate with data) |

---

## 4. Reasoning: what's worth building, what isn't

**Worth building, in this order of conviction:**

1. **Decline-with-a-note (1a)** is the highest-leverage item because it's not a new
   feature — it's the missing half of one that exists. The DB column, the reason
   chips, and the "re-invite the keep-askers" logic all work today; the effort is
   surfacing (host notification + cascade view), parity (guests), and one optional
   textarea. It strengthens the cascading-invite loop, which `docs/DOCKET.md`
   identifies as the product's wedge.
2. **Kid-inclusive interests (3a)** is the best value-per-hour in the entire list:
   a constants-file edit that immediately flows through onboarding, settings,
   people discovery, mutual matching, nearby, and the AI discovery prompt.
3. **Welcome-page simplification (4)** is cheap, measurable, and gates the tutorial
   decision: you can't judge whether a tour is needed until the interface stops
   needing one.
4. **Offers & requests on boards (2a)** is real product work but the right shape is
   small: the client's "unified composer with an offer/request selector" already
   exists as the Notice/Event kind toggle — this adds two pills, three columns, one
   small table, and one notification. It also future-proofs the post model that
   `docs/DOCKET.md` already plans to reuse for zone announcements.

**Not worth building (now):**

- **Full messaging (1b).** The client listed it as an option, but the underlying
  need is one sentence of context, not a channel. Switchboard's no-DM posture is a
  considered safety decision; reversing it for an RSVP edge case would import
  harassment, unread-state, and moderation costs far exceeding the value.
- **Borrowing logistics (2b).** Duration, urgency flags, return expectations, and
  handoff coordination structure a workflow that trusted neighbors complete in one
  reply. Structure it only if fulfilled-request data shows coordination failing.
- **A modal product tour (5b).** The busy-first-screen complaint and the
  tour request are the same problem stated twice. Fix the cause (too much
  explaining), add a checklist that teaches by doing, and only then re-evaluate.
- **Event attributes (3b).** An attribute with no filter surface is a form field
  that does nothing. Park it until events are publicly discoverable.

**The "one flexible system" answer.** Three generalizations cover all five asks
without a new platform:
- `board_posts` becomes the **general community-post primitive** (notice / event /
  offer / request now; zone announcements later) — one composer, one RLS model,
  one moderation path.
- Invite responses get a **response-context pattern** (categorical reason +
  optional free text) instead of a messaging system — reusable later for
  cancellations or "maybe" states if ever wanted.
- Interests stay **plain strings matched by intersection** — new audiences are
  vocabulary additions, not schema. The deliberate *non*-generalization: no new
  event-tag taxonomy and no new messaging primitive until a second consumer exists.

---

## 5. Phased roadmap

**Phase 1 — quick wins (≈1 sprint):**
1. "Family & Kids" interests (hours).
2. `/welcome` copy + IA pass (1–2 days, copy-heavy).
3. Decline-with-a-note, including guest parity, host notification, cascade-view
   surfacing (3–5 days incl. migration + tests).

**Phase 2 — structural improvements (≈2–3 sprints):**
4. Onboarding lightening (2 steps, deferred interests, trimmed explainers).
5. "Getting started" checklist on Home.
6. Offers & requests v1 on boards (kinds + expiry + fulfilled + "I can help" +
   author notification).

**Phase 3 — validate, then extend (later):**
7. Post-level reporting into the moderation queue.
8. Per-board notification preferences (if response data shows posts going unseen).
9. "Children welcome" event attribute — only alongside public event discovery.
10. Re-evaluate a walkthrough against post-Phase-1/2 funnel data.

---

## 6. Feature specifications

### F1 — Decline with a note ("graceful decline, completed")

**User flow (member):** Event page → "Can't make it" → existing chips ("Can't this
time — keep asking! 💛" / "Not really my thing") → new optional textarea, *"Add a
note for {host}? (optional)"* → confirm. **Guest (token link):** decline now shows
the same two chips + optional note before confirming. **Host:** gets one
notification *"{name} can't make it — left you a note"* linking to the event; the
cascade view shows the note under the declined row.

**UI changes:**
- `src/components/events/RsvpCard.tsx` — optional textarea (≤280 chars, counter)
  in the existing decline sub-panel; submit passes note + message.
- `src/app/rsvp/[token]/GuestRsvpClient.tsx` — decline path gains the two reason
  chips + the same optional textarea (guests currently get neither).
- `src/components/events/CascadeProgress.tsx` — render `decline_message` (quoted,
  muted) under declined rows; keep the `· "ask me again!"` tag; `not_my_thing`
  stays visually plain (its mutedness is intentional kindness).

**Data model / backend:**
- Migration: `alter table public.invites add column decline_message text
  check (char_length(decline_message) <= 280);` — `decline_note`'s CHECK is
  untouched (reasons stay categorical; words are separate).
- Replace `respond_to_invite` with a 4-arg version (`p_message text default
  null`), **dropping the 3-arg overload** to avoid PostgREST dispatch ambiguity;
  re-grant to `authenticated`.
- Replace `respond_to_guest_invite` with `(p_token, p_accept, p_note default null,
  p_message default null)`, dropping the 2-arg overload; decline branch writes
  both columns; grant stays `service_role`-only.
- `src/lib/actions/invites.ts` — `respondToInvite` / `respondToGuestInvite` accept
  and forward the message; on decline **with a message**, call `notifyUsers` on
  the host with new kind `rsvp_declined`.
- `src/lib/notifications.ts` — map `rsvp_declined → 'plans'`.

**Notifications / permissions:** one host notification, only when a note is
attached (plain declines stay silent — "calm" is a design constraint and the
cascade view already records them). Existing invite RLS already scopes reads to
host + invitee; there is no authenticated UPDATE path, so the message is writable
only through the definer RPCs.

**Privacy & safety:** one-shot, one-directional, and only toward a host who
invited the sender — no reply channel, so negligible harassment surface. Rendered
as React text children (auto-escaped); guest path keeps its existing rate limit;
`user_reports` covers abuse of the text.

**Analytics:** extend `invite_responded` props with `decline_note` (categorical)
and `has_message` (boolean). Never the message content (guardrail in
`docs/analytics.md`). Success signals: % of declines using `keep_asking`, % with a
note, and re-invite acceptance rate on cloned events.

**Acceptance criteria:**
- [ ] Member and guest declines can attach an optional ≤280-char note; both can also decline without one in the same number of taps as today.
- [ ] Guest declines can now record `keep_asking` / `not_my_thing`; run-it-back cloning honors guest reasons identically to member reasons.
- [ ] Host receives a `rsvp_declined` in-app notification (+ push per `notify_plans`, quiet-hours respected) iff a note was attached.
- [ ] `CascadeProgress` shows the note to host/co-hosts only; the invitee still sees their own row; other invitees see nothing (pgTAP: RLS unchanged, message not readable cross-invitee).
- [ ] Old RPC overloads are dropped; `npm test` and `supabase test db` green.

### F2 — Offers & requests on neighborhood boards

**User flow:** Board → composer → kind pills **📌 Notice · 🔁 Event · 🎁 Offer ·
🙋 Request** → title, details, optional "listed until" chip (3 days / 1 week /
2 weeks / 1 month). Members see badged cards; on someone else's offer/request a
one-tap **"I can help" / "I'm interested"** (+ optional ≤280-char note) notifies
the author with the responder's name. The author sees responder names on the card
and taps **"Mark fulfilled"** when done ("Found one! 🎉"); expired posts drop out
of the default feed at read time.

**UI changes:** `src/app/boards/[slug]/BoardClient.tsx` — two new kind pills;
duration chips; badges + fulfilled/expired states; response button + responder
list (author-only); one-line disclaimer under the composer: *"Lending and giving
are arranged between neighbors — Switchboard doesn't hold deposits or guarantee
returns."*

**Data model / backend (one migration):**
- Widen `board_posts.kind` CHECK to `('notice','event','offer','request')`; add
  `expires_at timestamptz`, `resolved_at timestamptz`.
- New `board_post_responses (id, post_id fk cascade, responder_id fk cascade,
  note text check (char_length(note) <= 280), created_at, unique (post_id,
  responder_id))`. RLS: INSERT self, member of the post's board, not the author;
  SELECT post-author + responder; DELETE responder. RLS on, `to authenticated`.
- `board_posts` UPDATE policy (author-only, `WITH CHECK`, per SECURITY.md §2) for
  `resolved_at`; freeze `author_id`/`board_id`/`kind` with a `BEFORE UPDATE`
  trigger (the `freeze_*` pattern from `20260712120000_authz_hardening.sql`).
- Read-time expiry filter in `src/app/boards/[slug]/page.tsx` (the
  signals/moments precedent — no cron change needed).
- `src/lib/actions/boards.ts`: extend `addBoardPost` (kind + expiry validation);
  add `respondToBoardPost` (re-check membership, insert, `notifyUsers` author,
  rate-limit ~10/hr) and `resolveBoardPost`.
- `src/lib/notifications.ts`: `board_response → 'social'`.

**Notifications / permissions:** author-only notification on response; **no
fan-out on new posts** in v1 (boards are silent today; a busy board would become
noise — revisit with per-board prefs in Phase 3). All visibility stays
member-gated by existing board RLS.

**Privacy & safety:** invite-only boards are the trust boundary — no public
marketplace surface. Responder identity is revealed only to the post author.
Author/moderator delete already exists; post-level reporting is a known follow-up
(Phase 3). Liability handled by scope (no money, no deposits, no return tracking)
plus the disclaimer line.

**Analytics:** `board_post_created {kind}`, `board_post_response`,
`board_post_resolved {kind, response_count}` — no titles/content. Success:
requests receiving ≥1 response within 48h; % of offers/requests marked fulfilled;
repeat posting per board.

**Acceptance criteria:**
- [ ] Members can create offer/request posts with optional expiry; notices/events unchanged.
- [ ] Non-author members can respond once per post; the author is notified and sees responder names + notes; non-authors cannot read others' responses (pgTAP).
- [ ] Author can mark fulfilled; fulfilled shows a badge; expired posts leave the default feed with no cron involvement.
- [ ] Non-members can read/write nothing (pgTAP on both new/changed tables); `kind`/`author_id`/`board_id` immutable post-creation.
- [ ] Composer disclaimer visible on offer/request kinds.

### F3 — "Family & Kids" interests

**User flow:** unchanged — the new category simply appears in onboarding, Settings,
and matching.

**UI changes:** none beyond the data (pickers render from constants).

**Data / backend:** `src/lib/interests.ts` — append category **Family & Kids
(🪁)**: *Park days with kids, Playdates, Hiking with kids, Family bike rides,
Library storytime, Museums with kids, Kid-friendly food spots, Zoo & aquarium
trips, Parent & caregiver meetups, Family game nights*. `DOWN_TO_GROUP`: *Park day
with kids, Playdate*. `ACTIVITY_PRESETS` (`src/lib/types.ts:377-390`): *Playdate*,
*Park day with kids* (so Mutual mode covers them). **Additive only — never rename
existing labels** (stored strings would orphan, `interests.ts:12-14`). No
migration; `profiles.interests` is open `text[]`.

**Language:** all labels are parent/caregiver-neutral ("Parent & caregiver
meetups", never "moms' groups").

**Privacy & safety:** no child data is created — these are adult-profile interest
strings. Selecting them discloses caregiver status on discovery surfaces; that is
the user's explicit choice and already governed by the `discovery_interests`
toggle. Actual meetups flow through existing invite-only plans, so no child
location data is introduced. Do not add child ages/profiles (COPPA-adjacent;
nothing in the ask requires it).

**Analytics:** no new events; adoption is measurable from `profiles.interests`
aggregates and whether these strings start appearing in `shared_interests`
matches.

**Acceptance criteria:**
- [ ] New category + down-to + activity entries render in onboarding, Settings, and Mutual; two users sharing a kid-interest see it in `shared_interests` in people discovery.
- [ ] No existing label changed; `npm test` green; AI discovery prompt picks up the interests automatically (it reads `profiles.interests`).

### F4 — First-screen simplification (`/welcome`, then onboarding)

**Assumption (stated):** "the first page" = **`/welcome`** — it is the first thing
every new user sees and its ~220–240 words / six feature cards match the
"amount of text" complaint precisely. The onboarding form is the second-worst
offender and is included; the logged-in home gets a lighter touch in Phase 2.

**Diagnosis:** a combination — copy volume (six ~20-word cards), **jargon**
(internal feature names as headings), and parallel choice (six equally-weighted
features before a single action). Visual hierarchy itself is fine (single column,
clear CTAs).

**Changes — `/welcome` (`src/app/welcome/page.tsx`):**
- Keep: wordmark, hero ("Make plans. / Like magic."), one primary CTA, footer.
- Tighten the subhead to ~12 words.
- Replace the six feature cards with **three benefit lines** (~10 words each, no
  feature names), e.g.: *"Invite friends one at a time — no group-chat chaos"*;
  *"Say you're free without broadcasting it"*; *"Interest is only revealed when
  it's mutual."* Remaining features are discovered in-product (progressive
  disclosure: the More-sheet already carries per-surface descriptions).
- Target: **≤120 words total**, one screen of scroll on mobile.
- Signup box: keep both consent checkboxes (legal artifact), shrink the covenant
  preamble to one line + link to `/community`.

**Changes — onboarding (Phase 2, `src/app/onboarding/*`):**
- Two light steps: **(1)** name + handle + consent; **(2)** interests — top
  categories collapsed, *"Pick a few — add more anytime in Settings"*, down-to
  merged in, skippable-but-encouraged.
- Cut the circles explainer to one line (teach circles in `/people`, where they
  live); completion still writes `profiles.onboarded` — no storage change.

**Notifications/permissions/privacy:** none — copy and layout only.

**Analytics:** add funnel events `signup_completed` and `onboarding_completed`
(server-side, convention per `src/lib/analytics/events.ts`); client pageviews
already cover `/welcome → /login` progression. Success: welcome→signup and
signup→onboarded conversion, time-to-first-plan.

**Acceptance criteria:**
- [ ] `/welcome` ≤120 words, ≤3 feature blurbs, no internal feature names in headings; hero + CTA visible without scrolling on a 375-px viewport.
- [ ] Onboarding requires only name + handle + consent to proceed; interests deferrable; total explainer prose ≤40 words.
- [ ] Conversion events flowing; no regression in `e2e` auth/onboarding specs.

### F5 — "Getting started" checklist (instead of a tour)

**User flow:** after onboarding, Home shows one **Getting started** card with three
live items: ☐ *Add your first friend* (→ `/people`) · ☐ *Tell friends you're
around* (→ tap a signal) · ☐ *Float your first plan* (→ `/create`). Items check
themselves off from real data (`friendCount`, active signal, plans created). Card
auto-retires when complete; ✕ dismisses early.

**UI changes:** new `src/components/home/GettingStarted.tsx` rendered from
`src/app/page.tsx`, **replacing** (not joining) the current `friendCount === 0`
gold card; Settings gains a "Show getting-started tips" reset link.

**Data / storage:** completion is **derived live** — no schema. Dismissal:
localStorage `sb-getting-started-dismissed` (the established `sb-*` preference
pattern; per SECURITY.md §4 localStorage is fine for preferences, never
authorization). No new tables, no migration.

**Notifications/permissions/privacy:** none. No nagging — the card never pushes.

**Analytics:** `getting_started_completed` (server-derivable alternative: funnel
on existing `plan_created` + connection events); item-tap tracking via existing
client autocapture.

**Acceptance criteria:**
- [ ] New user sees exactly one guidance card (checklist), not two; each item deep-links; states reflect live data on next load.
- [ ] Completing all three (or dismissing) removes the card permanently on that device; Settings reset restores it.
- [ ] No modal, no overlay, no step-blocking anywhere.

---

## 7. Ordered engineering task list

**Phase 1**
1. **T1 — Family & Kids vocabulary.** Edit `src/lib/interests.ts` (new category; `DOWN_TO_GROUP` additions) and `src/lib/types.ts:377-390` (`ACTIVITY_PRESETS`). No migration. *(No dependencies.)*
2. **T2 — Welcome rewrite.** `src/app/welcome/page.tsx` (`FEATURES` array → 3 benefit lines, subhead, word budget); trim covenant preamble in `src/app/login/LoginForm.tsx:278-321`. *(No dependencies.)*
3. **T3 — Decline-note migration.** New `supabase/migrations/<ts>_decline_message.sql`: add `invites.decline_message`; replace + re-grant `respond_to_invite` (drop 3-arg) and `respond_to_guest_invite` (drop 2-arg) — base on the current definitions in `20260717081000_restore_event_room_membership.sql`. pgTAP: cross-invitee unreadability, constraint, overload removal. *(Blocks T4–T6.)*
4. **T4 — Server actions + notification.** `src/lib/actions/invites.ts` (`respondToInvite`, `respondToGuestInvite`); new kind in `src/lib/notifications.ts`; analytics props in the `capture` call (`invites.ts:113`). *(After T3.)*
5. **T5 — RSVP UIs.** `src/components/events/RsvpCard.tsx` (textarea); `src/app/rsvp/[token]/GuestRsvpClient.tsx` (reason chips + textarea). *(After T4.)*
6. **T6 — Host surfacing.** `src/components/events/CascadeProgress.tsx` (+ host fetch already includes full rows via `src/app/events/[id]/page.tsx:189-235`). e2e: decline-with-note flow in `e2e/`. *(After T4.)*

**Phase 2**
7. **T7 — Onboarding restructure.** `src/app/onboarding/OnboardingForm.tsx`, `page.tsx`; `completeOnboarding` unchanged in storage (`src/lib/actions/profile.ts:158-237`). Add `signup_completed`/`onboarding_completed` to `src/lib/analytics/events.ts` + `docs/analytics.md`. *(After T2 for copy consistency.)*
8. **T8 — Getting-started checklist.** New `src/components/home/GettingStarted.tsx`; wire into `src/app/page.tsx` replacing the lines-179-193 gold card; Settings reset link. *(After T7 ideally.)*
9. **T9 — Boards offer/request migration.** New `supabase/migrations/<ts>_board_offers_requests.sql` per F2 (kind CHECK, `expires_at`, `resolved_at`, `board_post_responses` + RLS, UPDATE policy + freeze trigger). pgTAP: membership gating, response visibility, immutability. *(Blocks T10–T12.)*
10. **T10 — Board actions.** `src/lib/actions/boards.ts`: extend `addBoardPost` (:159-191); add `respondToBoardPost`, `resolveBoardPost`; kind in `src/lib/notifications.ts`; analytics events. *(After T9.)*
11. **T11 — Board UI.** `src/app/boards/[slug]/BoardClient.tsx` (pills :182-202, fields :224-247, card states :274-323); read-time expiry filter in `src/app/boards/[slug]/page.tsx:26-32`. *(After T10.)*
12. **T12 — Board e2e + docs.** Offer→respond→fulfil spec; update `README.md` feature table + `docs/analytics.md`. *(After T11.)*

**Phase 3 (scoped, not started):** post-level reporting (extend `user_reports` or a `content_reports` table into `src/app/moderation`); per-board notification prefs; event `kid_friendly` attribute alongside public discovery; walkthrough re-evaluation against funnel data.

---

## 8. Open questions for the client (with working assumptions)

1. **Which screen felt busy?** *Assumed `/welcome`* (first thing a new user sees; most text). If they meant the logged-in home, Phase 2's checklist-consolidation + a home trim moves up.
2. **Should accepts also carry a note** ("running late, coming after dinner")? *Assumed decline-only v1* — accepts already have host-defined RSVP questions; the column supports extension later.
3. **Offers/requests: inside existing invite-only boards, or a public neighborhood surface?** *Assumed existing boards* — trust, moderation, and privacy come free; a public marketplace contradicts the current safety model and the cold-start reality.
4. **Notification appetite for new board posts?** *Assumed none in v1* (author-response only) to protect the "calm" constraint.
5. **Is a one-line disclaimer sufficient for lending liability, or does counsel want ToS language?** *Assumed disclaimer + existing ToS.*
6. **Any need to record children's ages for age-range matching?** *Assumed no* — v1 deliberately stores no child data; "age range" can live as label granularity later ("Toddler playdates") if demand shows.
7. **May guests see the reason chips** (marketing-visible wording on a public token page)? *Assumed yes* — parity is the point.
8. **Legal check:** can the two signup checkboxes' surrounding prose be shortened without affecting consent validity? *Assumed yes (prose, not the checkboxes, is trimmed).*

---

## 9. What to build first

**Build Phase 1, starting with the decline-note (F1), with F3 and F4 shipped
alongside it in the same sprint.**

F1 is the strongest first move because it is the rare request where the client's
instinct and the codebase agree: the "invite me next time" mechanism already
exists (`keep_asking` + run-it-back), and the work is finishing and surfacing it —
guest parity, one optional sentence, and letting the host actually see it. It
directly deepens the cascading-invite loop that the product's own strategy doc
calls the wedge, at small, well-bounded cost. F3 is a near-free inclusion win the
same day; F4 is a copy edit with conversion upside and is the prerequisite for
making an evidence-based call on the tutorial. Full messaging, borrow-logistics,
and a modal tour are the three places the feedback, taken literally, would have
created lasting complexity — each is replaced above by a smaller mechanism that
solves the stated need.
