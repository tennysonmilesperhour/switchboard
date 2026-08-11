> **Archived 2026-08-11.** Phase 1 largely shipped (room-message notifications,
> the rooms inbox with unread state and sections, announcement doctrine fix).
> Not built: signal rings on avatars, the Give Space invariant in SECURITY.md,
> mutual muting, the daily digest, custom signals, message search, and the
> availability heatmap — all carried forward in [`../DOCKET.md`](../DOCKET.md).

# Client Feedback Round 2 — Review & Plan

*Product / UX / safety review of six pieces of client feedback, grounded in the
current codebase. Planning only — nothing here is implemented yet. Companion to
[`CLIENT-FEEDBACK-PLAN.md`](CLIENT-FEEDBACK-PLAN.md).*

---

## 1. The asks, and the problem underneath each

| # | Client ask | Actual underlying problem |
|---|---|---|
| 1 | "Any luck on some way to receive notifications that there's activity?" | Notifications are **built but not landing**. Either delivery is misconfigured, or the events people care about (a message in a room) never fire one at all. |
| 2 | "Give access to calendars, and tell a group the most likely time(s) everybody is available" | **Date-picking is the slowest step in group planning.** The app knows who's invited but nothing about when they're free, so the group falls back to a text thread. |
| 3 | "I love the matchmaker option" | Validation, not a request. Worth noting what makes it work so the next feature inherits it. |
| 4 | "I love Give Space. Could it be used in a stalker-y way — turn it on and always know where I'll be?" | An asymmetric-visibility feature needs an explicit, written **safety invariant**, or it drifts into a tracker one sprint at a time. |
| 5 | "Living rooms are cool, but that long list is overwhelming. It needs to be searchable." | `/rooms` is **an archive presented as an inbox**: no ordering by activity, no unread state, no preview, no search, no way for old rooms to recede. |
| 6 | "A way to see status updates… somewhere between having to go look, and a million notifications" | There's **no middle tier**. Everything is either silent (you must open the app) or a push. The missing layer is *ambient* — visible in passing, costing zero interruptions. |

---

## 2. Current state (what's actually in the codebase)

### Notifications
- The write path is unified and good: `notifyUsers()` (`src/lib/server/notify.ts:32`) writes a **durable in-app row** and then best-effort pushes it, with the stated doctrine *"nothing that matters is push-only."*
- Web push is fully wired: VAPID + `web-push`, `/api/push/subscribe`, a service worker, per-category preferences (`plans` / `reminders` / `messages` / `social` — `src/lib/notifications.ts`), quiet hours, an unread bell (`src/components/shell/NotificationBell.tsx`), a dismissible enable-nudge (`src/components/shell/NotificationNudge.tsx`), and a `/notifications` feed.
- **21 notification kinds** fire across the app (invites, RSVPs, matches, comments, reminders, join requests, photos…).
- Three concrete gaps explain "no activity notifications":
  1. **Room chat notifies nobody.** `src/lib/actions/rooms.ts` never calls `notifyUsers` — a message in a Living Room produces no push and no in-app row. Only room *photos* (`kind: 'photo'`) and *event-thread* comments do.
  2. **Host announcements are push-only.** `src/lib/actions/announcements.ts:76` calls `sendPushToUsers` directly, so they never land in `/notifications` — the one place in the codebase that breaks the doctrine above.
  3. **Push is optional infrastructure.** `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` are documented as *optional* (`docs/DEPLOYMENT.md:62`). If they aren't set in the Vercel project, `enablePush()` returns `'unsupported'` and **the nudge silently hides itself** (`src/lib/client/push.ts:33`). On iPhone, push additionally requires the PWA to be added to the home screen first.
- There is no email fallback for users who never enable push (`RESEND_API_KEY` exists, used for guest invites and announcements to non-users only).

### Calendar
- Calendar integration today is **one-way, outbound only**: per-event `.ics` links (`src/lib/calendar-links.ts`, `src/lib/ics.ts`) and a personal token-authed subscription feed (`src/app/api/calendar/[token]/route.ts`).
- Nothing reads anyone's availability. The only availability data the app holds is the ephemeral **signal** ("free tonight ☕", 1–8h, audience-scoped).
- The decision primitive already exists: **Anonymous Weighted Input polls** (`src/lib/actions/polls.ts`) with a consensus meter — a time-overlap feature can feed it rather than inventing a second way to decide.
- Availability Heatmap (#8) and read-only Calendar Sync (#9) are already scoped in `docs/INNOVATIONS.md` and unbuilt.

### Give Space
- `profile_avoids` (`supabase/migrations/20260711120500_profile_avoids.sql`): a private, one-directional row. RLS scopes it to the avoider, so the avoided person can never observe it. Stated rule: **warn, never remove.**
- The only consumer is the event page (`src/app/events/[id]/page.tsx:294-306`), and it is correctly gated: the heads-up is computed **only from the attendee list the viewer can already see** (`canManage || event.show_accepted`), so it never becomes an "is X going?" oracle for a hidden guest list. Rendered privately at line 547 with "Only you can see this."
- **Adding someone to your list grants you zero new visibility today.** That is the key fact.
- Adjacent surfaces, for threat-model context:
  - Live location (`supabase/migrations/20260718120000_live_location.sql`): opt-in, time-boxed 1–8h, discovery is **mutual** (you see nobody unless you're also sharing), coordinates coarsened to 3dp (~110 m), `are_blocked` enforced in `find_nearby_people`.
  - Signals (`20260717130000_multi_audience_signals.sql`): visible only to accepted connections, further narrowed by circle audience.
  - Blocking deletes the connection row (`connections.ts`), so a block removes signal visibility as a side effect.
- The real gap: **`profile_avoids` is not consulted anywhere except that one heads-up.** Someone you've asked space from still sees your live pin (if you're both sharing), your availability signals, your moments, and you still surface in their discovery. Give Space currently protects you *from surprise*, not *from exposure*.

### Rooms
- `/rooms` (`src/app/rooms/page.tsx`) lists **every room you've ever been in**, sorted by `rooms.created_at` — i.e. by when the room was born, not when anything last happened in it.
- No last-message preview, no participant faces, no search, no filter, no archive.
- **No unread state exists at all**: `room_members` is `(room_id, member_id, joined_at)` (`20260703120000_init.sql:78`) — there is no `last_read_at` column anywhere.
- Rooms are created automatically for every event, match, and moment, so the list grows monotonically and never recedes. The overwhelm is structural, not cosmetic.

### Status / ambient signals
- `availability_signals` already *is* a status system: emoji + label + expiry + audience, several can be lit at once (`src/lib/actions/signals.ts`).
- Surfaced in exactly one place: the home page (`src/app/page.tsx:46-56`) shows your own signals and up to 12 friends' signals. They appear nowhere else in the app.
- `Avatar` (`src/components/ui/Avatar.tsx`) already takes a `ring` prop — but it's a plain white ring, with no status meaning.
- The server accepts **any** emoji + label (`addSignal` inserts them unvalidated); the UI only offers 8 presets (`SIGNAL_PRESETS`). Free-text status is a UI change, not a schema change — but it would need a length clamp and would become the app's first free-text field broadcast to all connections.

---

## 3. Decision table

| # | Problem | Recommendation | Value | Effort | Risks | Timing |
|---|---|---|---|---|---|---|
| 1a | Push may not be configured | **Verify VAPID keys in production**; make the failure loud instead of silent (surface "push unavailable on this server" in Settings rather than hiding the nudge) | **Critical** — if this is unset, every other notification item is moot | XS | None | **Now, first** |
| 1b | Room messages notify nobody | `notifyUsers` on new room messages, **bundled**: notify a member at most once per room per 30 min, skip anyone currently viewing | **High** — this is the "activity in the app" the client means | S–M | Noise is the whole risk; bundling + the existing `messages` category toggle are the mitigation | **Now** |
| 1c | Announcements are push-only | Route through `notifyUsers` so they land in `/notifications` | Medium (consistency + doctrine) | XS | None | **Now** |
| 1d | Users who never enable push get nothing | **Daily email digest** (opt-in, Resend already wired) for users with no push subscription | Medium | M | Email fatigue; one per day maximum, off by default | **Later** |
| 2a | Group date-picking | **Availability Heatmap** (INNOVATIONS #8): everyone paints a week grid, overlap ranks the windows, top options flow into the existing AWI poll | **High** — solves the ask for 100% of users with no OAuth, no third party, no calendar data at rest | M | Needs a genuinely good mobile paint interaction or it loses to a group text | **Next** |
| 2b | "Give access to calendars" literally | **Read-only Google Calendar free/busy**, per-user opt-in, used *only* to prefill the heatmap | Medium — multiplies 2a, but doesn't stand alone | L | OAuth scope trust; never store or display event titles; must be revocable in one tap | **Later**, after 2a proves the interaction |
| 2c | Auto-suggested times without input | Infer availability from past RSVP behavior | **Do not build.** Guessing when someone is free from their behavior is exactly the surveillance feel the product avoids | Low | M | Contradicts the brand | **No** |
| 4a | Give Space could drift into a tracker | **Write the invariant into `docs/SECURITY.md`**: the avoid list may only *filter* information already on a page the viewer opened; it may never generate a notification, never widen a query, and never appear on the map, zones, or moments | **High** — cheapest possible durable safeguard | XS | None | **Now** |
| 4b | Give Space is one-way visibility | Make it **mutually muting**: filter `profile_avoids` out of nearby discovery, signal visibility, moments, and mutual-mode candidates — in both directions | **High** — makes the feature match its name and removes the asymmetry the client is worried about | M | Touches a SECURITY DEFINER function and two RLS policies; needs pgTAP coverage | **Next** |
| 4c | Users can't tell who sees what | A **"who can see me right now"** screen in Settings: live share status + expiry, lit signals + audience, discovery opt-ins, blocks and avoids | Medium-High | M | None; pure transparency | **Next** |
| 5a | Rooms list is an archive | **Sort by last activity, show a message preview**, and add **unread dots** (`last_read_at` on `room_members`) | **High** — converts a list into an inbox; the single biggest fix | M | Adds a write on every room open; keep it a cheap upsert | **Now** |
| 5b | Long list never recedes | **Sections**: Active / Matches / Past, with rooms whose event ended >30 days ago auto-tucked into a collapsed "Past" | **High** — this is what "overwhelming" actually means | S | Needs the event join; matches and moments have no end date, so age them by last message | **Now** |
| 5c | "It needs to be searchable" | **Two-stage.** Ship an instant **title + person filter** first; follow with **full-text search over messages** (Postgres FTS, strictly RLS-scoped) — the ChatGPT-style search the client is describing | **High** | S, then M | Message search must not become a cross-room leak; the query must run under the caller's RLS, never `createAdminClient` | Filter **Now**, FTS **Next** |
| 6a | No ambient tier | **Signal ring on avatars everywhere** — extend `Avatar` with a `signal` prop (colored ring + emoji badge), render it in people lists, room headers, attendee rows | **High** — literally the bubble-on-the-profile-picture the client described, at zero notification cost | S | Must degrade gracefully at `xs` size; respects the same audience RLS | **Now** |
| 6b | No middle tier between silence and push | **One daily digest** at a user-chosen hour bundling everything non-urgent; interrupts stay reserved for invitations, RSVPs, replies, reminders | **High** — this is the explicit "somewhere between" ask | M | Depends on 1a; digest content must be worth opening or it trains dismissal | **Next** |
| 6c | Statuses are limited to 8 presets | Allow a **custom emoji + short label** signal (server already accepts it) | Medium | S | First broadcast free-text field: clamp to ~40 chars, strip newlines, make it reportable | **Next** |

---

## 4. Reasoning

### On notifications (1)
Nothing here is a missing feature — the plumbing is unusually complete. It's a
**configuration check plus two holes**. Verify the VAPID pair is set in Vercel
first, because if it isn't, the enable-nudge hides itself and every user
concludes the app has no notifications. Then wire room messages, which is almost
certainly the "activity" the client is thinking of: today you can hold an entire
conversation in a Living Room and the other people learn about it only by
opening the app.

Bundling matters more than delivery. One push per room per 30 minutes ("3 new
messages in Taco Night") is the difference between the feature working and the
client's own "million notifications" fear.

### On calendars (2)
The instinct to reach for calendar access is right, but the sequence should be
inverted. A read-only calendar link is a **large** project (OAuth, token refresh,
revocation, a trust conversation) and it only helps the subset of people who
keep an accurate calendar and are willing to connect it. The heatmap works for
everyone on day one, needs no third party, and stores no personal schedule data
— just "free-ish" marks on a week grid, scoped to one plan.

Build the heatmap, see whether time-overlap actually unsticks plans, and only
then add calendar sync as an accelerant that prefills the same grid. When it
ships, the rule is: read free/busy only, never titles, never store more than
derived busy blocks, per-plan opt-in, one-tap revoke.

Output should feed the existing AWI poll rather than becoming a new decision
surface: "Thursday 7pm works for 6 of 8" → the host taps it → it becomes a poll
option or the confirmed time.

### On Give Space (4) — the safety question
**The concern is well-aimed but the current implementation is not the problem.**
The heads-up is computed only against an attendee list the viewer could already
see, so putting someone on your list tells you nothing new. If you couldn't see
that guest list before, you still can't.

Where the concern becomes real is in the *obvious next features*. "Notify me
when someone I'm avoiding RSVPs" or "show avoided people on the map" would each
be a natural-sounding product idea, and either one converts a shield into a
tracker. That's why the first action here is documentation, not code: write the
invariant down in `docs/SECURITY.md`, next to the existing precedents, so the
answer exists before someone proposes the feature.

**Proposed invariant.** The avoid list may only *filter or annotate information
the viewer has already been granted on a page they opened themselves.* It may
never: generate a notification or digest entry; widen any query's result set;
appear on the map, in zones, in moments, or in any location surface; or be
readable by anyone but its owner.

The second action is the asymmetry the client's instinct is picking up on, from
the other side. Right now Give Space protects you from *surprise* but not from
*exposure*: the person you've asked space from still sees your signals and your
live pin. Making it mutually muting — filtering avoids out of `find_nearby_people`,
the signals policy, moments, and mutual-mode candidates in both directions —
makes the feature honest, and means turning it on genuinely reduces contact
rather than just informing you about it.

Worth stating plainly for the client: someone determined to track a specific
person would not use Give Space, because it shows them nothing they can't
already see. The surfaces that warrant ongoing care are the location ones, and
those are already built defensively — opt-in, mutual, time-boxed, coarsened to
roughly a city block, and block-aware. The gap worth closing is that users have
no single place to see what they're currently exposing, which is item 4c.

### On the rooms list (5)
"Overwhelming" is diagnosable: the list is sorted by room *birth date*, has no
unread state, no preview, and never lets anything age out. Every plan and every
match adds one forever. Search is a real ask, but it treats the symptom — sorting
by activity, showing a preview line, marking unread, and collapsing old rooms
into "Past" fixes the overwhelm on its own, and search then becomes what it is
in ChatGPT: how you find a specific old thing, not how you cope with the list.

Ship the cheap filter (title + participant names, client-side) immediately so the
ask is answered, then do message full-text search properly. The one hard rule
for FTS: the query runs as the caller under RLS. A search endpoint that reaches
for the admin client is a cross-room leak waiting to happen.

### On status updates (6)
The client has named the actual design problem: there are only two tiers, silent
and interrupt, and everything interesting falls in the gap. The fix is a third
tier that costs no attention:

- **Ambient** — visible in passing, no notification. Signal rings on avatars,
  a "who's around right now" strip on Home. Already 80% built; it just isn't
  rendered anywhere but one page.
- **Digest** — one interruption a day, at a time the user picks, bundling
  friends' signals, board posts, and room chatter.
- **Interrupt** — invitations, RSVPs to your plan, direct replies, reminders.
  Roughly today's `plans` and `reminders` categories, and nothing else.

Signals are the right primitive for "status" — they expire, which is what keeps
a status system from rotting into stale profile decoration. Adding a custom
emoji + label makes them expressive enough for the Facebook-bubble use case
without adding a second concept.

---

## 5. Phased roadmap

**Phase 1 — this week (small, high signal)**
1. Verify VAPID configuration in production; make an unconfigured server say so instead of hiding (1a)
2. Room-message notifications, bundled per room (1b)
3. Announcements through `notifyUsers` (1c)
4. Rooms: sort by last activity + message preview + unread dots (5a)
5. Rooms: Active / Matches / Past sections (5b)
6. Rooms: instant title + person filter (5c, stage 1)
7. Signal rings on avatars, app-wide (6a)
8. Write the Give Space invariant into `docs/SECURITY.md` (4a)

**Phase 2 — next**
9. Give Space becomes mutually muting, with pgTAP coverage (4b)
10. "Who can see me right now" screen (4c)
11. Daily digest, user-chosen hour (6b)
12. Custom emoji + label signals (6c)
13. Message full-text search (5c, stage 2)
14. Availability Heatmap → AWI poll (2a)

**Phase 3 — later**
15. Read-only Google Calendar free/busy prefilling the heatmap (2b)
16. Email digest fallback for non-push users (1d)
17. Matchmaker Hints (INNOVATIONS #14), now that the matchmaker is validated

---

## 6. Specs for the Phase 1 items

### S1 — Push configuration check
- `enablePush()` returns `'unsupported'` when `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is
  absent, and both the nudge and the Settings toggle then hide themselves. Split
  the state: `'unsupported'` (this browser can't) vs `'unconfigured'` (this
  server can't). Show the latter in Settings as an explicit line so the
  condition is diagnosable from the app instead of from the Vercel dashboard.
- Extend `/api/health` to report whether the VAPID pair is present (boolean
  only, never the keys).
- Keep the iPhone home-screen hint; add it to Settings, not just the nudge.

### S2 — Room message notifications
- On message insert in `src/lib/actions/rooms.ts`, notify every other room member
  with `kind: 'room_message'`, mapped to the existing `messages` category in
  `KIND_TO_CATEGORY`.
- **Bundling:** skip a recipient who already has an unread `room_message`
  notification for that room within the last 30 minutes; instead update the
  existing row's body to "N new messages in <room>". Mirrors the standing-nudge
  pattern in `notify.ts`.
- Body must not include message content beyond the first ~60 characters, and
  analytics must capture no content at all (existing guardrail).
- Deep-link straight to `/rooms/<id>`.

### S3 — Rooms inbox
- Migration: `alter table room_members add column last_read_at timestamptz`.
  RLS already scopes `room_members`; the UPDATE policy needs a `WITH CHECK` that
  pins `member_id = auth.uid()` so nobody can mark someone else's room read.
- Query rooms with the latest message (`created_at`, author, truncated body) and
  compare against `last_read_at` for the dot.
- Order by last message time, falling back to `rooms.created_at` for empty rooms.
- Sections: **Active** (event upcoming, or activity in 30 days), **Matches**,
  **Past** (collapsed, count only).
- Filter input above the list, client-side over title + participant names,
  no network round-trip.
- Opening a room upserts `last_read_at = now()`.

### S4 — Signal rings on avatars
- Extend `Avatar` with `signal?: { emoji: string; label: string }`: a terracotta
  ring plus a small emoji badge at bottom-right, hidden at `xs`.
- `aria-label` must include the label — the state cannot be conveyed by color or
  emoji alone (accessibility guardrail in `PRODUCT.md`).
- Render in `/people`, room headers, attendee rows, and mutual candidates.
- Read via the existing `signals_visible` policy, so the ring appears only for
  people who are already allowed to see that signal — no new exposure.

### S5 — Give Space invariant (docs only)
Add to `docs/SECURITY.md`, alongside the existing precedents:

> **Avoid lists filter, never reveal.** `profile_avoids` may only filter or
> annotate data the viewer already has access to on a page they opened
> themselves. It must never trigger a notification or digest entry, never widen
> a query's result set, and never surface on the map, in zones, or in moments.
> A feature that would tell a user *where* an avoided person is, or *when* they
> did something, is out of bounds regardless of how it is framed.

---

## 7. Open questions for the client

1. **Push in production** — do you currently get a system notification for a new
   invitation, or nothing at all? That answer splits "misconfigured" from
   "missing coverage" immediately. *(Working assumption: some kinds work, room
   chat is the visible hole.)*
2. **Search scope** — searching room *names* or searching *what was said*?
   The ChatGPT comparison suggests the second; it's a bigger build. *(Working
   assumption: ship the name filter now, message search next.)*
3. **Status updates** — ephemeral availability ("free tonight") or expressive
   identity ("supporting X")? Signals cover the first natively. *(Working
   assumption: extend signals with a custom label; revisit if you want
   long-lived statuses.)*
4. **Digest timing** — one morning digest, one evening, or user-chosen?
   *(Working assumption: user-chosen, defaulting to 9am local.)*
5. **Give Space semantics** — should turning it on also hide *you* from *them*
   (mutual muting, item 4b), or stay purely a heads-up? Mutual muting is safer
   and matches the name, but it is a behavior change for anyone already using it.
   *(Working assumption: make it mutual, and say so in the UI copy.)*
