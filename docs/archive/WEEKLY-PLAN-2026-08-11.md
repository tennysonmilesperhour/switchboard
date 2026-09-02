# Weekly Plan — 2026-08-11

> **Archived 2026-09-02.** All six items shipped. This is a point-in-time plan,
> not current product documentation; shipped behavior lives in
> [`src/lib/features.ts`](../../src/lib/features.ts) and current work lives in
> [`docs/DOCKET.md`](../DOCKET.md).

> **Status: all six shipped.** Built in the order below, one commit each. Where
> the plan's assumptions turned out to be wrong against the code, the change
> notes say so — see "What the plan got wrong" at the end.

Six updates for this week, each cross-referenced against the existing plans
(`DOCKET.md`, `INNOVATIONS.md`, the archived client-feedback and audit docs) and
against the code as it stands today, so work picks up where prior threads left
off instead of starting parallel ones.

Written alongside the docs consolidation of the same date: the point-in-time
plans and audits now live in `docs/archive/`, their still-open items are carried
forward in `DOCKET.md` ("Residuals carried forward"), and this file plus
`DOCKET.md` are the two places that describe work not yet done.

**Reality check that shaped this plan.** The three client-feedback plans still
said "planning only — nothing here is implemented yet," but nearly everything in
them has shipped (decline notes, board offers/requests and editing, the
getting-started checklist, the rooms inbox, permanent plan deletion, the
clickable invite link, 18+ terms, verified contacts). The audits' engineering
prompts were likewise executed. The docs were behind the code, which is why this
consolidation happened first.

---

## 1. Private groups, with owner-managed access

**What "groups" are in this codebase.** Four group-like things exist, and three
already have a privacy story:

- **Circles** (`/people`) — private to their owner by design; an audience tool,
  not a shared space. Nothing to do.
- **Boards** (`/boards`) — already invite-only and member-gated by RLS, with
  moderator roles and rotatable join links (`/boards/join/[code]`). This is the
  precedent to copy, not a gap.
- **Events** — access control exists but is scattered: visibility toggles
  (`show_invite_list`, `show_accepted`, `show_expired`), the share-link kill
  switch (`share_link_active`, governed by `src/lib/share-link.ts`), Open Table
  request-to-join approval, co-hosts, parental approval.
- **Zones** — the real gap. `zones_select … using (true)`
  (`20260703200000_innovations.sql`): every zone is visible to every
  authenticated user, and the organizer has no access controls at all.

**Prior threads this continues** (do not re-derive):

- `DOCKET.md` → "A reachability policy" primitive: *who can reach me, on what
  terms* — build once, surface everywhere. Private zones should be an instance
  of this, not a fifth bespoke model.
- `DOCKET.md` → "Spaces / verified-join communities": join links/codes +
  request-to-approve. Already shipped for boards; extend the same pattern.
- `DOCKET.md` → "Zones: richer curation + presence-gated announcements" — this
  week's work is the foundation that item needs.

**Scope this week:**

1. **Private zones.** `zones.visibility ('public'|'private')` + a `zone_members`
   table mirroring `board_members` (organizer/moderator/member), join links and
   request-to-approve copied from the boards pattern. RLS: private zones and
   their presence lists readable by members only. pgTAP coverage for every new
   policy (positive and negative).
2. **One "Privacy & access" panel for hosts.** On the event page, consolidate
   the existing scattered controls (visibility toggles, share-link kill switch,
   Open Table approvals, co-hosts) into a single owner-facing section. Mostly UI
   consolidation; no new authorization logic.

**Guardrails** (`docs/SECURITY.md` precedents): RLS with `WITH CHECK` on
UPDATE; ownership columns frozen by trigger; never a role on a self-writable
row; if private zones get share links, the `hostCanShare ⊆ canReadPlan`
invariant from `src/lib/share-link.ts` applies to them too — one module decides,
no call-site re-derivation.

---

## 2. Poll trees — follow-up decisions that unlock in order

**Current state.** One poll per event (`polls.event_id`), phases
`suggesting → voting → runoff → decided`, `vote_deadline` wired to the cron
runner, anonymity enforced at the DB (`poll_votes` author-only; aggregates via
`poll_results()`). `suggest_deadline` is a vestigial column (noted in the
archived MVP ship checklist as safe to drop — a poll-tree migration is the
natural moment to drop it).

**Prior threads this continues:**

- Client-feedback round 2 (archived): the AWI poll is *the* decision primitive —
  new deciders should feed it, never invent a second decision surface.
- `INNOVATIONS.md` #8 (Availability Heatmap) is explicitly scoped to feed its
  output into a poll — a future branch type for this same tree.
- The `deciding` event status + share-link caveat ("date still being polled")
  already handle "a plan with an open decision" — reuse, don't fork.

**Design.** Add `polls.topic` (date / place / food / activity / custom),
`polls.parent_poll_id`, and a `pending` phase. When a parent poll resolves
(cron runner or host action), its children advance `pending → suggesting` and
members get one notification ("The date's settled — now: where?"). The tree
mirrors the real order of group planning; only one active poll is surfaced at a
time so the plan page stays calm.

**Scope this week:** migration (+ drop `suggest_deadline`), unlock logic inside
the poll runner (server-authoritative, like cascade advancement), host UI to
"Add a follow-up poll" with a one-tap suggested chain (date → place → details),
reuse of `PollSection` for rendering, one new notification kind.

**Decision to make (recommendation inline):** an event should leave `deciding`
when the *root* (date) poll resolves — child polls continue under a confirmed
event. Keeps `ANSWERABLE_EVENT_STATUSES` and `rsvp_via_share_token` untouched;
`share-link.test.ts` will force the decision if a new status is added instead.

**Guardrails:** every poll in the tree keeps the anonymity invariant; unlock
conditions live in one place (the runner / a definer function), never
re-derived per surface.

---

## 3. A loop to close — gamified path through the features

**Current state.** The pieces exist separately: the `GettingStarted` card
(3 items, derived live, dismissible, settings reset — shipped from
client-feedback round 1), the `/features` index (~70 catalogued features,
test-enforced), and "Your Read" (`/you`) as the private-mirror precedent.

**Prior threads this continues — and their hard guardrail:**

- `DOCKET.md`'s "strategic fork": the sanctioned version of gamification is
  **(a) private progress, delight, never leaderboards** — `PRODUCT.md` bans
  manipulative growth loops, and the archived strategy doc (Part 7) is explicit:
  no guilt-streaks, celebrate outcomes not app-opens.
- The adventure-game epic (`DOCKET.md`, N12 in the archived demo checklist) is
  the *later, bigger* version of this. This week's loop should be a stepping
  stone toward it, not a competing system.

**Design: the feature passport.** Extend `/features` so each entry can show a
"tried it" state derived from real data (created a plan, voted, set a signal,
checked into a zone, filed something in a room, tried discover…), grouped into
the same pillars the index already has, with a quiet progress strip per group.
Completing a group gets a one-time warm moment; completing the passport closes
the loop. Private, never notifies, never counts what you *haven't* done in
guilt framing, self-retires. A small Home card ("Your tour: 3 of 6 rooms
visited") links to it, replacing nothing.

**Why `/features` and not a new page:** `features.test.ts` already governs that
surface; a new top-level page would need its own index entry and risks a second
catalogue drifting from the first.

**Tie-in:** the aesthetic customization work (#4) gives this loop its natural
intrinsic reward — an unlockable theme on completion. Optional, later.

---

## 4. Aesthetic customization

**Current state.** Per-event themes shipped (six `EventTheme` values, wizard
picker). The app-level look is driven entirely by the `@theme` token layer in
`globals.css` — `docs/DESIGN-SYSTEM.md`'s "If you re-theme" section documents
that swapping tokens restyles the whole app. No user-facing appearance setting
exists.

**Prior threads this continues:**

- `DOCKET.md` visual epic → "Image-based themes — a curated gallery … also the
  reward surface for the adventure game."
- `docs/archive/DESIGN-DIRECTIONS.md` — five fully specified alternate palettes
  (Almanac, Transit Board, Corkboard, Dusk Lounge, Riso) sitting unused. They
  are ready-made preset material.

**Scope this week:** Settings → **Appearance** with a small curated preset set —
default (pink), plus two or three derived from the design directions (Dusk
Lounge warm-dark and Almanac cream/ink are the strongest first pair). Implement
as a `data-theme` attribute on `<html>` remapping the token layer only (no
component forks), persisted on the profile so it follows the account across
devices. Image-background themes from the docket idea are a follow-up once the
token-switch plumbing exists.

**Guardrails:** every preset passes WCAG AA (`PRODUCT.md`); `DESIGN-SYSTEM.md`
gets updated in the same PR (it is the source of truth and must not go stale
the way the terracotta docs once did); reduced-motion behavior unchanged.

---

## 5. Naming review + a reference checklist

**Current state.** `src/lib/features.ts` is already the canonical catalogue of
user-facing names, and `features.test.ts` enforces that navigation and the
index agree — renames literally fail the test until the index is updated, which
makes it the right backbone for a naming pass. But legacy internal names still
appear elsewhere: `README.md`'s feature table leads with "Anonymous Weighted
Input" / "Mutual Mode" / "Digital Living Rooms", while the welcome page was
deliberately de-jargoned (client-feedback round 1) and the index uses friendly
names.

**Deliverable: `docs/NAMING.md`** — the requested checklist reference page. One
row per user-facing name: canonical name, where it appears (nav, page title,
features index, README, marketing), legacy aliases, and a decision column
(keep / rename-to / retire). Seeded from the bottom nav (Home, Explore, +,
Calendar, More), the More sheet, the six feature groups, and all ~70 index
entries.

**Process:** (a) this week, produce the checklist and mark the obvious
decisions; (b) renames get applied only after a decision is recorded, one PR per
coherent batch, letting `features.test.ts` catch every surface that must move
together. The in-app reference page for names already exists — it's `/features`;
the doc is the working checklist behind it.

---

## 6. Dashboard: equal pathways to the four pillars

**Current state** (`src/app/page.tsx`): the SignalBar (live availability) sits
at the top, the plan feed is the heart, and a "Make something happen" grid sits
at the very bottom with New plan / Discover / Mutual / Moments — close to, but
not, the four pillars, and buried below several conditional sections.

**The four pillars requested:** 1. make event · 2. mutual interest · 3. live
availability · 4. serendipity zone.

**Prior threads this continues:**

- `DOCKET.md` visual epic → "Dashboard = two living streams" (the bigger
  redesign this row is a step toward).
- Client-feedback round 1 (archived): the calm constraint — one guidance card,
  no dashboard of dormant features for a new user; empty-state-as-onboarding.

**Design:** a four-up pillar row of equal-weight tiles directly under the
greeting: 🪜 **Make a plan** (`/create`) · ◐ **Mutual** (`/mutual`) · 🟢 **I'm
free** (opens the signal composer, so the pillar and the SignalBar don't
duplicate) · 🎪 **Zones** (`/zones`). Same size, same tone, no tile gets the
brand gradient alone — equal emphasis is the point. The contextual feed
(invitations waiting, plans) stays immediately below; the bottom quick-actions
grid retires in favor of this row so Home gets calmer, not busier.

**Tension to hold:** `PRODUCT.md` principle 1 is "make the *next* social action
obvious" — four equal doors deliberately trade a single obvious action for
legible breadth. Resolved by keeping the row compact (one row, small tiles) and
letting the feed below stay the true center of gravity.

---

## Sequencing (as built)

1. ✅ **Docs consolidation** — merged as #131.
2. ✅ **Dashboard pillar row + naming checklist** (`de1e7a2`) — no schema.
3. ✅ **Private zones + host Privacy & access panel** (`ff6e0d2`) —
   `20260812120000_private_zones.sql`, `supabase/tests/private_zones.test.sql`.
4. ✅ **Poll trees** (`1145884`) — `20260812130000_poll_trees.sql`,
   `supabase/tests/poll_trees.test.sql`, `src/lib/poll-tree.test.ts`.
5. ✅ **Feature passport** (`0a44293`) — no migration; `src/lib/passport.test.ts`.
6. ✅ **Appearance presets** (`e6a9c67`) —
   `20260812140000_appearance_theme.sql`, `src/lib/themes-app.test.ts`.

Standing quality bar held on each: `npm test`, `npx tsc --noEmit`,
`npm run lint`, and `npm run build` green, a features-index entry for every
user-facing surface, and an error code for every new operational failure.

**Two migrations and two pgTAP suites need Docker**, which this environment
doesn't have: run `supabase test db` once locally before these go to
production, and apply `20260812120000`, `20260812130000`, and `20260812140000`
via the normal migration workflow.

## What the plan got wrong

Three assumptions in this document did not survive contact with the code. All
three were resolved in favour of the code, and each is recorded in the commit
that hit it:

1. **`suggest_deadline` is not vestigial.** The plan said the poll-tree
   migration was the moment to drop it, on the archived checklist's word.
   `create_event_atomic` writes it and the wizard collects it, so dropping the
   column would have broken plan creation. What was true is that nothing ever
   *acted* on it — a host who set "suggestions close at 6pm" got nothing at
   6pm. The sweep now performs that transition, so the setting means what it
   says, and the column stays.
2. **Explore can't be a passport stamp.** The plan listed "tried discover" as a
   derivable milestone. Discovery is stateless by design — the AI call stores
   nothing — so the stamp could only have been a guess or a new tracking table
   built for a badge. Replaced with joining a board or zone, which leaves a
   real row.
3. **The event page could not survive a second poll.** It read its poll with
   `.maybeSingle()`, which throws as soon as a plan has two. The poll-tree work
   had to fix the reader before it could add the writer.

One thing the plan under-scoped: the `.plan-*` card gradients were hardcoded
hex, so appearance presets would have restyled the whole app *except* the plan
cards in the middle of every screen. They now derive from the token layer.

## Open questions (assumptions noted, not blocking)

1. **"Groups" scope** — assumed zones are the target (boards are already
   private). If events-only was meant, item 1 shrinks to the host panel.
2. **Poll tree authoring** — assumed host-added follow-ups plus a one-tap
   suggested chain, not auto-created chains on every poll plan.
3. **Serendipity pillar destination** — assumed `/zones`. A "serendipity hub"
   (zones + moments + map) is a reasonable alternative if zones alone feels
   narrow.
4. **First theme presets** — assumed Dusk Lounge + Almanac from the archived
   design directions. Say the word if you'd rather start from Transit Board.
5. **Naming renames** — assumed decide-this-week, apply-in-batches, rather than
   renaming everything at once.
