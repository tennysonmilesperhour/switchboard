> **Archived 2026-08-11.** The Phase 1 walkthrough checklist for the delivered
> demo. Its "Next phase" items (N1–N16) are carried forward in
> [`../DOCKET.md`](../DOCKET.md) so this snapshot no longer needs updating.

# Demo MVP — Scope Checklist

A line-by-line checklist for reviewing the demo MVP side-by-side with the app.
It's split into two phases:

- **Phase 1 — Demo MVP (delivered).** Everything the demo was scoped to deliver.
  Every line is code-complete on this branch; walk it against the app and tick it.
- **Next phase (not in this scope).** Work that was never part of the demo MVP —
  activation steps to take the app live, and features deliberately deferred. Kept
  separate so the completion review stays clean.

Each line is a **click-to-expand** `<details>` block: open it for *what it is*,
*how to verify it in the app*, and — for next-phase lines — *what's needed to
complete it*.

Scope is drawn from `README.md` (feature set), `PRODUCT.md` (principles),
`docs/PARTIFUL-GAPS.md` (hosting table-stakes), and the build-state audits
(`MVP-SHIP-CHECKLIST`, `COMPLETION-PLAN`, `SHIP-READINESS-AUDIT`), cross-checked
against the actual app routes, `src/lib/actions/*`, and `supabase/migrations/*`.

**Tally:** Phase 1 — 61 delivered lines · Next phase — 7 ops/activation + 9 future.

---

# Phase 1 — Demo MVP (delivered)

## A. Core social mechanics — the nine headline features

<details><summary><b>A1 — Cascading invites</b> — invite in your order, one at a time or in waves</summary>

- **What it is:** Instead of blasting everyone at once, you set an order and the app reaches out one person (or small wave) at a time. The moment someone accepts, the chain stops so you never over-invite. A background job keeps the chain advancing even when nobody has the app open.
- **Verify:** Create a plan, add several invitees, and watch it advance then stop on the first accept. — `/create`, `/events/new`
</details>

<details><summary><b>A2</b> — Preview simulator before you send</summary>

- **What it is:** On the review step, a simulator shows exactly who would be reached and in what order, so there are no surprises before the first invite goes out.
- **Verify:** On the review step, run the simulator and read the projected order.
</details>

<details><summary><b>A3</b> — Shareable guest links: read with no account, sign in to answer</summary>

- **What it is:** Share a plain link with someone who has no account; the plan opens for them immediately — who's hosting, when, where — with no signup and no app. Answering is the one step that asks them to sign in or make an account, which is also what puts the plan (and its add-to-calendar links) in their app.
- **Verify:** Open an invite link in a signed-out browser: the plan renders, and where the RSVP buttons would be there's a sign-in step that returns you to the same link to answer. — `/i/[token]`, `/rsvp/[token]`, `/join/[id]`
</details>

<details><summary><b>A4</b> — Post-send cascade editing — reorder, resend, change the window</summary>

- **What it is:** After the chain is live, the host can still reorder who's up next, resend, or change how long each person has to respond — without rewriting who already accepted.
- **Verify:** On a live plan's host view, reorder the queue and change a response window.
</details>

<details><summary><b>A5 — Anonymous weighted input</b> — private love / good / rather-not ranking</summary>

- **What it is:** For group decisions (which date, which place) everyone privately rates each option love / good / rather-not, and a consensus meter shows how the group is leaning.
- **Verify:** As a non-host, rate options and confirm the consensus meter moves.
</details>

<details><summary><b>A6</b> — Poll resolution — auto / host-pick / runoff by a deadline</summary>

- **What it is:** A poll can resolve on its own, by the host picking, or through a runoff between the top options, at a deadline the host sets in the wizard.
- **Verify:** Set a vote deadline and run a poll through to a resolved winner.
</details>

<details><summary><b>A7</b> — Individual votes are unreadable by design</summary>

- **What it is:** No one — not even the host — can see how any single person voted; the group only ever sees the aggregate. Enforced at the database layer, not just hidden in the UI.
- **Verify:** Confirm the group sees only totals; there is no per-person vote view anywhere.
</details>

<details><summary><b>A8 — Mutual mode</b> — "Down to Connect" stays private unless it's mutual</summary>

- **What it is:** Privately signal "I'd be down to connect" with someone. They only learn of it if they independently signal the same; unrequited interest is never observable by anyone. Includes "Open to Reschedule".
- **Verify:** Two accounts express intent; only the mutual case reveals, and it appears live. — `/mutual`
</details>

<details><summary><b>A9 — Availability signals</b> — one-tap "Coffee Break?", circle-scoped, auto-expiring</summary>

- **What it is:** A one-tap "I'm free" visible only to the circles you choose, that expires on its own. No public broadcast.
- **Verify:** Raise a signal to one circle, confirm others can't see it, and confirm it expires.
</details>

<details><summary><b>A10 — Digital living rooms</b> — chat that files addresses, tasks, links, notes into tabs</summary>

- **What it is:** A group chat that automatically sorts what you drop in — addresses, tasks, links, notes — into tidy tabs, so nobody scrolls back through chat to find the address. Claude Haiku with a free rules-based fallback.
- **Verify:** Paste an address and a link into a room; watch them file into the right tabs. — `/rooms/[id]`
</details>

<details><summary><b>A11</b> — Room photos</summary>

- **What it is:** Send photos into a room with the 📷 control; they collect in a Photos tab.
- **Verify:** Send a photo in a room and find it in the Photos tab.
</details>

<details><summary><b>A12</b> — Chat + filed items update live for everyone</summary>

- **What it is:** Messages and the auto-filed items appear live for every member with no refresh, and the sender never sees their own message duplicated.
- **Verify:** With two accounts in one room, confirm live updates and no double-send.
</details>

<details><summary><b>A13 — Smart activity discovery</b> — describe it → curated fits, each with a "why"</summary>

- **What it is:** Describe the kind of thing you want to do and the app returns a handful of fitting activities, each with a short "why this fits", that you turn into a plan in one tap. Claude Sonnet with a deterministic no-key fallback.
- **Verify:** Describe an experience and turn a suggestion into a plan. — `/discover`
</details>

<details><summary><b>A14 — Shared moments</b> — three moments of consent before anyone is revealed</summary>

- **What it is:** Check in somewhere and, if someone else is there, you each move through three consent steps (open → curious → 🤝) before either is revealed. It advances live, sends real notifications, and drops you both into a shared room on match.
- **Verify:** Two accounts check into the same place and progress to a match + room. — `/moments`
</details>

<details><summary><b>A15</b> — Optionally geo-tag a check-in so it lands on the map</summary>

- **What it is:** Attach a location to a check-in and the moment appears on the map layer.
- **Verify:** Geo-tag a check-in and find it on the map.
</details>

<details><summary><b>A16 — Serendipity zones</b> — named places you check into</summary>

- **What it is:** Named places you check into — a conference, a cruise, a campus, a festival. The zone is the place; your check-in is a moment within it. An empty state guides the first zone.
- **Verify:** Create and check into a zone. — `/zones`, `/zones/[slug]`
</details>

<details><summary><b>A17</b> — Anchor a zone to a spot → it appears on the map</summary>

- **What it is:** Give a zone a location and it shows up as a toggleable layer on the map.
- **Verify:** Anchor a zone and confirm its map layer.
</details>

<details><summary><b>A18 — Live on the map</b> — opt-in, mutual, coarsened, auto-off</summary>

- **What it is:** Opt in to share your location and appear live to others also sharing nearby. Mutual (you only see people who can see you), respects blocks, blurred to ~110 m, and turns itself off after a couple of hours.
- **Verify:** Two accounts opt in and see each other; confirm the coarsening and auto-off. — `/map`
</details>

<details><summary><b>A19</b> — Plans, zones, and shared places as toggleable map layers</summary>

- **What it is:** Everything spatial lives on one map as independent layers you can switch on and off.
- **Verify:** Toggle each layer independently on the map.
</details>

## B. Hosting essentials — table-stakes, in our calm idiom

<details><summary><b>B1</b> — Automatic reminders — day-before, holding-invite nudge, starting-soon</summary>

- **What it is:** A day-before reminder to people who are in, a gentle nudge to anyone still holding an invite, and a "starting soon" ping. Fires at most once per window and respects quiet hours. (Which channels these go out on is switched on in the next phase; in-app always works.)
- **Verify:** Confirm the reminder toggle in the wizard (default on) and the in-app nudges.
</details>

<details><summary><b>B2</b> — Host announcements — the calm "text blast"</summary>

- **What it is:** A one-way host broadcast (door code, running late, bring a jacket) that lands on the event page and in the living room.
- **Verify:** Post an announcement and see it on the event page and in the room.
</details>

<details><summary><b>B3</b> — Per-guest RSVP questions</summary>

- **What it is:** The host can ask questions on RSVP (dietary needs, what are you bringing); answers are visible only to the host, and it works for members and token-link guests.
- **Verify:** Add a question, answer it as a guest, and confirm only the host sees it.
</details>

<details><summary><b>B4</b> — Cover image</summary>

- **What it is:** Each plan can carry a cover image that renders on the event page and in link previews.
- **Verify:** Set a cover image and view the event page.
</details>

<details><summary><b>B5</b> — Wishlist / registry link</summary>

- **What it is:** A plan can link out to a registry or wishlist, shown on the event page.
- **Verify:** Add a wishlist link and confirm it renders.
</details>

<details><summary><b>B6</b> — One-tap Google Calendar + ICS feed</summary>

- **What it is:** Guests get a one-tap Google Calendar add and an ICS feed for their own calendar app, including from the accepted-guest state.
- **Verify:** Accept and use the calendar add; subscribe to the ICS feed. — `/api/calendar/[token]`, `/api/events/[id]/ics`
</details>

<details><summary><b>B7</b> — Guest-list CSV export</summary>

- **What it is:** The host can export the guest list as a CSV.
- **Verify:** Export the CSV from the host event view. — `/api/events/[id]/guests.csv`
</details>

<details><summary><b>B8</b> — Run It Back — re-invite the crew, minus the "not my thing" folks</summary>

- **What it is:** Re-invite the same crew into a fresh plan in one step, automatically dropping anyone who said it wasn't their thing.
- **Verify:** Run It Back from a past event and check the pre-seeded crew.
</details>

## C. Accounts, onboarding & profile

<details><summary><b>C1</b> — Email + password sign-up / sign-in</summary>

- **What it is:** Create an account and sign in with email and password — the only sign-in method in the demo's scope. The account lifecycle works even with email delivery off.
- **Verify:** Create an account and sign in. — `/login`
</details>

<details><summary><b>C2</b> — Forgot / reset password with expired-link handling</summary>

- **What it is:** Full forgot-password and reset flows, including a clear message when a reset link has expired that points back to requesting a new one.
- **Verify:** Request a reset; open an expired link and read the message. — `/forgot-password`, `/reset-password`
</details>

<details><summary><b>C3</b> — Onboarding enforced app-wide</summary>

- **What it is:** New users are guided through picking interests and starter circles, enforced no matter which deep link they arrive through — then continued to their intended destination.
- **Verify:** Sign in via a deep link with a fresh account and confirm you're routed to onboarding first. — `/onboarding`
</details>

<details><summary><b>C4</b> — Profile edit + public profile</summary>

- **What it is:** Edit your own rich profile and view other people's public profiles.
- **Verify:** Edit your profile and open a public profile page. — `/profile/edit`, `/u/[handle]`
</details>

<details><summary><b>C5</b> — Account deletion + confirmation banner</summary>

- **What it is:** Users can delete their account and land on a "your account was deleted" confirmation.
- **Verify:** Delete a throwaway account and see the banner. — `/settings`, `/welcome`
</details>

<details><summary><b>C6</b> — Contact-verification surface</summary>

- **What it is:** A screen where a user can verify a contact method (email / phone). The surface and verified-contact records are in place. (Requiring verification before stranger-matching is a safety item in the next phase — N8.)
- **Verify:** Open the verify-contact surface and add a contact. — `/verify-contact`
</details>

## D. People, circles & safety

<details><summary><b>D1</b> — Circles as a real management view</summary>

- **What it is:** Circles aren't just tags — open one to see members, add/remove people, rename or delete it, and change its emoji.
- **Verify:** Open a circle and add, remove, rename. — `/people`
</details>

<details><summary><b>D2</b> — Connect / friend requests, with resend</summary>

- **What it is:** Send connect requests (recipient is notified) and resend one that's still pending.
- **Verify:** Send a request, then resend it while pending.
</details>

<details><summary><b>D3</b> — Blocking, enforced across discovery / matching / map</summary>

- **What it is:** Blocking someone removes them from your discovery, matching, and the map — enforced, not cosmetic.
- **Verify:** Block an account and confirm they disappear from those surfaces.
</details>

<details><summary><b>D4</b> — Give space / "ex-filter" — warn, never remove</summary>

- **What it is:** Quietly flag someone you'd rather not run into. You get a private heads-up only if they're already-visibly attending something — never a way to probe hidden guest lists. It only warns, never removes anyone, and is invisible to the other person.
- **Verify:** Give space to someone and confirm the private, visible-only heads-up behavior. — `/people`
</details>

<details><summary><b>D5</b> — Moderation review queue</summary>

- **What it is:** An operator screen to triage and resolve user reports. Moderator access is granted through a gated mechanism (not a field a user can set on themselves); actions re-authorize the specific moderator.
- **Verify:** As a non-moderator you can't read others' reports; as a moderator you can triage. — `/moderation`
</details>

<details><summary><b>D6</b> — Report / Block reachable where you'd meet a bad actor</summary>

- **What it is:** Report and block are reachable from profiles, room members, moment reveals, and requests — the places you'd actually encounter someone.
- **Verify:** Find report/block from each of those surfaces.
</details>

## E. Boards / community

<details><summary><b>E1</b> — Invite-only local boards (notices + events, RLS-gated)</summary>

- **What it is:** Invite-only local groups with notices and events, walled off by the database so only members see the content.
- **Verify:** Confirm a non-member can't see a board's content. — `/boards`, `/boards/[slug]`
</details>

<details><summary><b>E2</b> — Shareable board invite links, rotatable</summary>

- **What it is:** Moderator-minted join links for a board that can be rotated.
- **Verify:** Join via a link; rotate the code as a moderator. — `/boards/join/[code]`
</details>

<details><summary><b>E3</b> — Board posts / notices with the "first date" shown</summary>

- **What it is:** Posts and notices, including the first date of a happening rendered on the post.
- **Verify:** Create a post with a first date and confirm it renders.
</details>

<details><summary><b>E4</b> — Community landing</summary>

- **What it is:** A landing surface that leads into boards.
- **Verify:** Open the community page. — `/community`
</details>

## F. Notifications & realtime

<details><summary><b>F1</b> — Durable in-app notifications</summary>

- **What it is:** A notifications inbox that persists independent of push, so nothing is lost when push is off.
- **Verify:** Trigger a notification and find it in the inbox. — `/notifications`
</details>

<details><summary><b>F2</b> — Working notification preferences</summary>

- **What it is:** Real controls to choose what you're notified about, saved through the settings save-bar.
- **Verify:** Change a preference and confirm it saves. — `/settings`
</details>

<details><summary><b>F3</b> — Realtime across rooms, moments, mutual</summary>

- **What it is:** Rooms, room items, moments, and mutual matches all update live via the database's realtime publication.
- **Verify:** Observe a live update on each surface with two accounts.
</details>

## G. Platform & production readiness

<details><summary><b>G1</b> — PWA install — manifest, iOS icon, app-wide service worker</summary>

- **What it is:** Installable as an app with a real home-screen icon on iOS and a service worker registered across the whole app (not just where push is used).
- **Verify:** Add to Home Screen on iOS and confirm the real icon; check the SW is active.
</details>

<details><summary><b>G2</b> — Link unfurls / OG images with a correct base URL</summary>

- **What it is:** Shared event links unfurl with the right preview image resolved against the correct origin.
- **Verify:** Share an event link and confirm the unfurl image.
</details>

<details><summary><b>G3</b> — robots + sitemap + root error boundary</summary>

- **What it is:** Robots and sitemap are in place, app routes are disallowed, and a top-level error boundary renders a styled page if the root ever throws.
- **Verify:** Load `/robots.txt` and `/sitemap.xml`.
</details>

<details><summary><b>G4</b> — Health endpoint</summary>

- **What it is:** A `/api/health` endpoint (behind the CRON_SECRET bearer) that reports database and schema status for monitoring.
- **Verify:** Hit `/api/health` with the bearer and read the JSON. (Reads green once the prod migrations in N1 are applied.)
</details>

<details><summary><b>G5</b> — Legal pages with a real contact</summary>

- **What it is:** Privacy, terms, and copyright pages, with a real, monitored DMCA/report address on the copyright page.
- **Verify:** Open each legal page and confirm the contact. — `/privacy`, `/terms`, `/copyright`
</details>

<details><summary><b>G6</b> — Internal /design page hidden in production</summary>

- **What it is:** The internal design-system route 404s in production while staying reachable in dev/preview.
- **Verify:** Confirm `/design` 404s on the production deployment.
</details>

<details><summary><b>G7</b> — Green baseline — tests / type-check / lint / build</summary>

- **What it is:** Unit tests, TypeScript type-check, lint, and the production build all pass on this branch.
- **Verify:** Run `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`. (The pgTAP + authed-E2E suites need Docker — run once per N7.)
</details>

## H. Design & accessibility principles (`PRODUCT.md`)

<details><summary><b>H1</b> — Make the next social action obvious</summary>

- **What it is:** The primary create paths route through a single intent launchpad so the next move is always clear.
- **Verify:** Confirm the main CTAs lead through `/create`.
</details>

<details><summary><b>H2</b> — Privacy by default; reveal only what's expected</summary>

- **What it is:** The privacy-sensitive invariants (anonymous polls, mutual-only reveals) hold at the database layer.
- **Verify:** Spot-check that private state never leaks in the UI.
</details>

<details><summary><b>H3</b> — Invite + friend flows fast enough for mobile</summary>

- **What it is:** One-tap group chips, stacked fields with no overlap, quick selection — tuned for a phone in motion.
- **Verify:** Run the wizard on a phone-sized viewport.
</details>

<details><summary><b>H4</b> — Clear status feedback over silent loading</summary>

- **What it is:** Actions give explicit states and toasts; failures surface rather than hanging silently.
- **Verify:** Exercise an action and confirm clear success/failure feedback.
</details>

<details><summary><b>H5</b> — WCAG AA contrast + keyboard operability</summary>

- **What it is:** Text meets AA contrast and the app is operable by keyboard with visible focus.
- **Verify:** Do a keyboard-only pass and check focus states.
</details>

<details><summary><b>H6</b> — Respect reduced motion</summary>

- **What it is:** Animations quiet down when the OS reduced-motion setting is on.
- **Verify:** Enable reduced motion and confirm calmer animation.
</details>

<details><summary><b>H7</b> — Results in text, not color alone</summary>

- **What it is:** Contact and invite results carry text labels, not just color, so they're readable without color perception.
- **Verify:** Check that results read correctly in grayscale.
</details>

<details><summary><b>H8</b> — Non-contact-picker fallback (.vcf upload)</summary>

- **What it is:** On browsers without the contact picker, users can upload a `.vcf` file instead.
- **Verify:** On desktop, import contacts via `.vcf` upload.
</details>

---

# Next phase — not in this scope

Work that was never part of the demo MVP. No checkboxes — this is the roadmap
conversation, not the completion review.

## Ops & activation — code/infra is in place; each needs a switch-on step

<details><summary><b>N1</b> — Apply the pending database migrations to production <em>(release-blocking)</em></summary>

- **What it is:** Schema changes committed in the repo need to be applied to the live database so the deployed app and its schema match. The audit's #1 release blocker.
- **What's needed to complete:** Run the `deploy-migrations` workflow (configure its Supabase secrets so it stops failing closed) or `supabase db push --linked`, then confirm parity with `supabase migration list --linked` and a green `/api/health`.
</details>

<details><summary><b>N2</b> — Activate email / SMS invite + reminder delivery</summary>

- **What it is:** Guest invites, reminders, and announcements can be delivered by email (Resend) and optionally SMS (Plivo). The sending code is built but no-ops without keys, so in the demo those reach people only as in-app messages and shareable links.
- **What's needed to complete:** Set `RESEND_API_KEY` + `EMAIL_FROM` (and/or the `PLIVO_*` vars) — or decide the pilot runs on in-app + links only and set that expectation with the client.
</details>

<details><summary><b>N3</b> — Activate web push</summary>

- **What it is:** Push notifications to phones and desktops. The service worker is already registered app-wide; push just needs signing keys.
- **What's needed to complete:** Generate VAPID keys (`npx web-push generate-vapid-keys`) and set the public and private keys.
</details>

<details><summary><b>N4</b> — Choose a cron / scheduler plan</summary>

- **What it is:** Time-based work — the cascade-advancement guarantee, poll/vote deadline resolution, reminder sweeps — runs on a once-a-minute cron. Vercel's free tier caps cron at once a day, so on a free deploy those don't fire reliably (lazy on-page-load advancement still works).
- **What's needed to complete:** Keep the project on Vercel Pro, or point an external scheduler (GitHub Actions / cron-job.org) at `/api/cron/cascade` with the `CRON_SECRET` bearer.
</details>

<details><summary><b>N5</b> — Set the support / contact email</summary>

- **What it is:** Legal and contact pages surface a support address.
- **What's needed to complete:** Set `NEXT_PUBLIC_SUPPORT_EMAIL` to an inbox the client actually monitors.
</details>

<details><summary><b>N6</b> — Seed a demoable environment</summary>

- **What it is:** For a live walkthrough, the discovery / people / mutual surfaces need seeded content and profiles marked discoverable, or they render empty.
- **What's needed to complete:** Run the discovery-demo seed against the demo project (never production) and confirm those surfaces render non-empty.
</details>

<details><summary><b>N7</b> — Run the DB + authenticated test suites once before release</summary>

- **What it is:** Security invariants have pgTAP coverage and there's an authenticated end-to-end suite; both need Docker / a seeded Supabase and weren't run in the build environment.
- **What's needed to complete:** Run `supabase test db` and the `E2E_DB=1` Playwright suite once against a disposable project before shipping.
</details>

## Future scope — deliberately deferred beyond the demo

<details><summary><b>N8</b> — Contact-identity verification before stranger-matching (safety)</summary>

- **What it is:** Today email/phone can be used for matching without proof of ownership. Acceptable for a small trusted pilot, but a gap before matching is opened to strangers.
- **What's needed to complete:** Add OTP-verified contact records (send a code, verify ownership) and require them before matching opens beyond a trusted group.
</details>

<details><summary><b>N9</b> — Google / OAuth sign-in</summary>

- **What it is:** One-tap sign-in with Google or another OAuth provider.
- **What's needed to complete:** Wire an OAuth provider and its callback. Deliberately excluded from the demo — email + password is the only auth path in scope.
</details>

<details><summary><b>N10</b> — SMS as an RSVP path</summary>

- **What it is:** Letting guests RSVP purely by SMS / phone number.
- **What's needed to complete:** A deliberate divergence — the product uses email reach so a guest never hands over a number. Build only if that product decision changes.
</details>

<details><summary><b>N11</b> — Internationalization</summary>

- **What it is:** Support for languages other than English.
- **What's needed to complete:** A full i18n pass; the app is English-only for the demo.
</details>

<details><summary><b>N12</b> — Adventure game / tiers / merchant perks</summary>

- **What it is:** The ambitious "engineered serendipity" layer — challenges → rewards → tiers that restyle the app → merchant perks.
- **What's needed to complete:** A large epic, and a deliberate call to build the intrinsic/delight version, never leaderboards or spend-funnels (per `PRODUCT.md`'s anti-references).
</details>

<details><summary><b>N13</b> — Businesses in Explore</summary>

- **What it is:** Letting verified local businesses publish prebuilt experiences that surface in discovery with a "Plan this" CTA.
- **What's needed to complete:** Build on the venue-claim system; the guardrail is fit + quality, never paid placement. On the design-workshop docket.
</details>

<details><summary><b>N14</b> — Board post → a real scoped event</summary>

- **What it is:** Turning a board's recurring-event announcement into an actual plan with its own RSVP and room.
- **What's needed to complete:** Board events currently render as announcements; spawning a real event row from a board post is a workshop item.
</details>

<details><summary><b>N15</b> — Client-side error capture + product analytics</summary>

- **What it is:** Catching front-end errors to a monitoring sink, plus activation/usage analytics.
- **What's needed to complete:** Server-side operational logging exists; the client error sink and analytics are deferred.
</details>

<details><summary><b>N16</b> — Get-to-know-you games, connect-tier layers, richer Moments gates</summary>

- **What it is:** Icebreaker games, closeness-tier framing on connect requests, and a richer allow/deny gate system for Moments.
- **What's needed to complete:** On the design-workshop docket; not part of the demo scope.
</details>

---

### How to read the result

- Every **Phase 1** line is code-complete on this branch. If one misbehaves when
  you exercise it in the app, that's a regression to file — capture the route and
  the observed behavior.
- **Next-phase** lines were never in this scope. The **Ops & activation** group is
  the shortest path from "delivered code" to "live for the client"; the **Future
  scope** group is net-new build for a later phase.
