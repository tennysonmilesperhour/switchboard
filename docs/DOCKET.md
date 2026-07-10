# Switchboard Docket

A living backlog of shipped work, queued builds, and design threads captured
from working sessions. Newest thinking lives here so nothing evaporates.

> Legend: ✅ shipped · 🛠️ queued to build · 🎨 in design / workshop · 💭 idea

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

---

## 🛠️ Queued to build

- **Settings autosave.** Replace the per-section Save buttons with
  autosave-on-change (debounced ~600ms) + an inline "Saved ✓"; toggles save
  instantly, text fields on blur/pause. Self-contained.
- **Intent launchpad** (a broader, simpler layer before the 6-step wizard —
  see design note below). *Awaiting green light.* Step 1 = the chooser screen;
  "Help me figure it out" reuses the existing poll/`deciding` engine.
- **Post-send cascade editing.** Edit the queued tail freely (reorder, add,
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
- **"Ex-filter" / give-me-space.** A private, one-directional "warn me if
  they'll be there" edge, invisible to the other person (softer sibling of the
  existing block). Guardrail: **warn, never remove** — the avoided person is
  never told or excluded. Separate, host-private "these two don't mix" note for
  guest-list hygiene. Open: warn on invited vs accepted; wording.
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

Privacy spine for all of the above: public = opt-in *per event*, the map shows
*events people chose to share* (never live people), "down to hang" stays
circle-scoped.

*(Open threads still to hear back on: SLC Lunatics — the story got cut off.)*
