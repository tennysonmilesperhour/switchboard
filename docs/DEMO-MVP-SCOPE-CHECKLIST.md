# Demo MVP — Scope Checklist

A line-by-line checklist of everything the demo MVP was scoped to deliver, for a
side-by-side review against the running app. It's drawn from the original scope
(`README.md` feature set + `PRODUCT.md` principles), the hosting table-stakes we
committed to (`docs/PARTIFUL-GAPS.md`), and the honest build state
(`docs/MVP-SHIP-CHECKLIST.md`, `docs/COMPLETION-PLAN.md`,
`docs/SHIP-READINESS-AUDIT.md`).

Walk each row with the app open. Use the **Open** hint to find the surface and
the **Verify** note to confirm it behaves as agreed.

## Status legend

- ✅ **Built** — code-complete on this branch; verifiable in the app now.
- ◑ **Needs ops** — code is done, but the feature only functions once the client
  supplies a credential / config / infra step (see Section I). These are *not*
  code gaps.
- ⊘ **Out of scope** — deliberately excluded from the demo MVP by agreement.
  Listed so "it's missing" reads as "we agreed to skip it," not an oversight.

**Score:** 60 built · 6 needs-ops · 12 out-of-scope (agreed exclusions).

---

## A. Core social mechanics — the nine headline features

The differentiated core from `README.md`. Each is a real surface backed by its
own actions, engine, and RLS invariants.

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| A1 | **Cascading invites** — invite in your order, one-at-a-time or in waves; the flow stops the moment someone accepts | ✅ | `/create` → `/events/new` | Capacity-checked atomic accept (`respond_to_invite`); advancement is lazy on page load and guaranteed by the 1-min cron |
| A2 | Preview simulator before sending the cascade | ✅ | Event wizard, review step | Simulate who gets reached in what order |
| A3 | Shareable guest links + token RSVP with no account | ✅ | `/join/[id]`, `/rsvp/[token]` | Accept as a signed-out guest; "You're in" state + add-to-calendar |
| A4 | Post-send cascade editing — reorder queued line, resend, change response window | ✅ | Host live view on the event | Security-definer `move_queued_invite` / `set_invite_window`; queued-only, host-checked |
| A5 | **Anonymous weighted input** — private ranking (love / good / rather-not) with a consensus meter | ✅ | Poll section on a deciding plan | Weight buttons persist across suggesting/voting/runoff |
| A6 | Poll resolution: auto / host-pick / runoff, resolved by a vote deadline | ✅ | Poll section; wizard sets the deadline | Cron poll-runner resolves by `vote_deadline` |
| A7 | Individual votes are unreadable by design | ✅ | — | `poll_votes` selectable only by author; group sees aggregates via `poll_results()` (RLS) |
| A8 | **Mutual mode** — "Down to Connect" stays private unless it's mutual; "Open to Reschedule" | ✅ | `/mutual` | Matching happens in a security-definer trigger; unrequited interest is never observable; match appears live |
| A9 | **Availability signals** — one-tap "Coffee Break?" visible only to chosen circles; auto-expires; no broadcasts | ✅ | Home / signals surface | Multi-audience select; expires on its own |
| A10 | **Digital living rooms** — chat where addresses, tasks, links, and notes file themselves into tabs | ✅ | `/rooms/[id]` | Claude Haiku filing with a zero-cost rules fallback |
| A11 | Room photos — 📷 uploads + sends a photo inline into a Photos tab | ✅ | Living room composer | Fulfils the empty-state promise |
| A12 | Room chat + auto-filed items live-update for every member | ✅ | Two accounts in one room | Realtime on `messages` and `room_items`; sender sees each message once |
| A13 | **Smart activity discovery** — describe the experience → a curated handful of fits, each with a "why" → one tap into a plan | ✅ | `/discover` | Claude Sonnet; deterministic no-key fallback |
| A14 | **Shared moments** — check in; three moments of consent (open → curious → 🤝) before anyone is revealed | ✅ | `/moments` | Advances live + durable notifications; lands in the shared room on match |
| A15 | Optionally geo-tag a check-in so the moment lands on the map | ✅ | Moment check-in | Coordinates flow to the map layer |
| A16 | **Serendipity zones** — named places (conference, cruise, campus, festival) you check into | ✅ | `/zones`, `/zones/[slug]` | Empty-state card present; a zone is the place, a moment is your presence in it |
| A17 | Anchor a zone to a spot → it appears on the map | ✅ | Zone create/edit | Shows as a toggleable map layer |
| A18 | **Live on the map** — opt-in to share location and appear live to others sharing nearby | ✅ | `/map` | Mutual (see-and-be-seen), block-aware, coarsened to ~110 m, auto-off after ~2h |
| A19 | Plans, zones, and shared places share one map as toggleable layers | ✅ | `/map` layer toggles | Each layer switches independently |

## B. Hosting table-stakes (Partiful-parity, our idiom)

The mechanics any host/guest expects, delivered consent-first (`docs/PARTIFUL-GAPS.md`).

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| B1 | Off-platform email invite delivery | ◑ | Guest invite on any plan | Sends once `RESEND_API_KEY` + `EMAIL_FROM` are set; graceful `[email:skipped]` no-op otherwise |
| B2 | Automatic reminders — day-before, still-holding-invite nudge, starting-soon | ✅ | Reminders toggle in wizard (default on) | Logic swept by cron; fires once per window, respects quiet hours (delivery rides B1/cron) |
| B3 | Host announcements — the calm "text blast" | ✅ | Event page → Announcements | Lands on the event page, in the living room, and as push/email |
| B4 | Per-guest RSVP questions — host-defined intake, answers visible only to the host | ✅ | Wizard question step → accept flow | Works for members and token-link guests |
| B5 | Cover image | ✅ | Event wizard | Renders on the event page + unfurls |
| B6 | Wishlist / registry link | ✅ | Event wizard | Shown on the event page |
| B7 | One-tap Google Calendar + ICS feed + per-event ICS | ✅ | Event page; `/api/calendar/[token]`, `/api/events/[id]/ics` | Guest accepted state offers a working calendar add |
| B8 | Guest-list CSV export | ✅ | Host event view; `/api/events/[id]/guests.csv` | Downloads a host-only CSV |
| B9 | Run It Back — re-invite the same crew minus the "not my thing" folks | ✅ | Past event | Spawns a fresh plan pre-seeded with the crew |

## C. Accounts, onboarding & profile

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| C1 | Email + password sign-up / sign-in (the only auth path in scope) | ✅ | `/login` | Account lifecycle works without email delivery |
| C2 | Forgot / reset password with expired-link handling | ✅ | `/forgot-password`, `/reset-password` | Expired reset link explains itself and links back |
| C3 | Onboarding enforced app-wide — interests + starter circles | ✅ | `/onboarding` (via any deep link) | A not-onboarded user hitting any path is routed to onboarding, then continues to their destination |
| C4 | Profile edit + public profile | ✅ | `/profile/edit`, `/u/[handle]` | Rich profile fields render publicly |
| C5 | Account deletion + "your account was deleted" banner | ✅ | `/settings` → delete; `/welcome?account=deleted` | Deletion completes and the banner shows |
| C6 | Contact-verification surface | ✅ | `/verify-contact` | Verified-contact rows exist; strangers-matching OTP hardening is an ops/safety step (I3) |

## D. People, circles & safety

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| D1 | Circles as a real management view — open, add/remove, rename/delete, editable emoji | ✅ | `/people` | Owner-scoped `renameCircle` / `deleteCircle` |
| D2 | Connect / friend requests, including resend of a pending request | ✅ | Profile cards / `/people` | Request notifications fire; pending can be resent |
| D3 | Blocking, enforced across discovery / matching / map | ✅ | Any people surface | Block gates discovery, matching, and map visibility |
| D4 | Give space / "ex-filter" — warn, never remove; invisible to the other person | ✅ | `/people` → Give space | Private heads-up only on an already-visible avoided attendee; never an "is X going?" oracle |
| D5 | Moderation review queue — operator triage & resolve of reports | ✅ | `/moderation` | Moderator capability is gated (not a self-writable column); writes re-authorize via `createAdminClient()` |
| D6 | Report / Block reachable from profile, room members, moment reveals, requests | ✅ | Those surfaces | Reporting is actionable end-to-end |

## E. Boards / community

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| E1 | Invite-only local boards with notices + events (RLS-gated) | ✅ | `/boards`, `/boards/[slug]` | Members see board content; non-members don't |
| E2 | Shareable board invite links — moderator-minted, rotatable | ✅ | `/boards/join/[code]` | Join via link; moderator can rotate the code |
| E3 | Board posts / notices with the "first date" shown | ✅ | Board post | `starts_at` renders on the post |
| E4 | Community landing | ✅ | `/community` | Entry to boards |

## F. Notifications & realtime

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| F1 | Durable in-app notifications | ✅ | `/notifications` | Rows persist independent of push |
| F2 | Working notification preferences | ✅ | `/settings` | Toggles save through the settings bar |
| F3 | Web push | ◑ | `/settings` push controls | Service worker is registered app-wide; push turns on once VAPID keys are set (I6) |
| F4 | Realtime across rooms, room items, moments, mutual | ✅ | Two accounts | Publication includes the relevant tables |

## G. Platform & production readiness

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| G1 | PWA install — manifest, apple-touch-icon, app-wide service worker | ✅ | Add to Home Screen | Real icon on iOS; SW `activated` in devtools |
| G2 | Link unfurls / OG images with a correct `metadataBase` | ✅ | Share an event link | OG image resolves to the right origin |
| G3 | `robots` + `sitemap` + root `global-error` boundary | ✅ | `/robots.txt`, `/sitemap.xml` | App routes disallowed; public routes indexed |
| G4 | Health endpoint | ◑ | `/api/health` (with `CRON_SECRET` bearer) | Returns `{ ok, database, schema }` — confirm after migrations are applied (I1) |
| G5 | Legal pages — privacy / terms / copyright with a real contact | ✅ | `/privacy`, `/terms`, `/copyright` | Copyright shows a monitored DMCA/report address |
| G6 | `/design` system route gated out of production | ✅ | `/design` | 404 in prod; reachable in dev/preview |
| G7 | Green baseline — unit tests / `tsc` / lint / build | ✅ | CI | pgTAP + authed Playwright need Docker; run once before release (I7) |

## H. Design & accessibility principles (`PRODUCT.md`)

| # | Scope item | Status | Open | Verify |
|---|---|---|---|---|
| H1 | Make the next social action obvious | ✅ | `/create` intent launchpad | Primary CTAs route through it |
| H2 | Privacy by default; reveal only what the user expects | ✅ | — | RLS anonymity invariants (polls, mutual) hold |
| H3 | Invite + friend flows fast enough for mobile | ✅ | Wizard on mobile | One-tap group chips; fields stack, no overlap |
| H4 | Clear status feedback over silent loading / hidden failure | ✅ | Any action | Toasts + explicit states; failures surface |
| H5 | WCAG AA contrast + keyboard operability | ✅ | Keyboard-only pass | Text contrast AA; focus states visible |
| H6 | Respect reduced motion | ✅ | OS reduced-motion on | Animations quiet down |
| H7 | Results in text, not color alone | ✅ | Contact/invite results | Text labels accompany color |
| H8 | Non-contact-picker fallback (.vcf upload on desktop) | ✅ | Import contacts on desktop | Upload a `.vcf` when the picker isn't available |

## I. Ops / credentials — only the client can close these

Not code gaps — these need a credential, an infra choice, or a run of the DB
suites. From `docs/MVP-SHIP-CHECKLIST.md` Bucket B.

| # | Ops item | Status | What to do |
|---|---|---|---|
| I1 | Apply pending DB migrations to production **(release-blocking)** | ◑ | Configure `deploy-migrations` secrets or `supabase db push --linked`; confirm parity with `supabase migration list --linked` |
| I2 | Invite delivery config | ◑ | Set `RESEND_API_KEY` + `EMAIL_FROM` (and/or `PLIVO_*`), or tell the client email/SMS is off for the pilot (in-app + shareable links still work) |
| I3 | Contact-identity OTP verification before opening matching to strangers | ◑ | Fine for a small trusted pilot; add OTP-verified contacts before public matching |
| I4 | `NEXT_PUBLIC_SUPPORT_EMAIL` | ◑ | Point legal/contact pages at an address the client monitors |
| I5 | Cron plan | ◑ | Vercel **Pro** for the every-minute sweep, or an external scheduler hitting `/api/cron/cascade` with the `CRON_SECRET` bearer |
| I6 | Push VAPID keys (optional) | ◑ | `npx web-push generate-vapid-keys` → set the two keys to enable push |
| I7 | Run pgTAP + authed Playwright once before release | ◑ | `supabase test db` (needs Docker) and the `E2E_DB=1` suite against a disposable project |
| I8 | Seed a demoable environment | ◑ | Point `seed:discovery-demo` at the demo project so discovery / people / mutual render non-empty |

## J. Explicitly out of scope (agreed exclusions)

Listed so the review reads these as intentional, not missing.

| # | Excluded item | Status | Why |
|---|---|---|---|
| J1 | Google / OAuth sign-in | ⊘ | Email + password is the only auth path in scope |
| J2 | SMS as a requirement to RSVP | ⊘ | Email reach instead; a guest never hands over a number |
| J3 | Internationalization | ⊘ | English-only for the demo (`<html lang="en">`) |
| J4 | Adventure game / tiers / merchant perks / leaderboards | ⊘ | The intrinsic/delight version is a later epic; avoids the anti-references in `PRODUCT.md` |
| J5 | Businesses in Explore (paid placement) | ⊘ | Explore competes on fit + quality, never paid placement (design workshop) |
| J6 | Board post → real recurring scoped event | ⊘ | Board events render as announcements; spawning a real `events` row is a workshop item |
| J7 | Client-side error capture + product analytics | ⊘ | Server-side operational logging exists; client sink deferred |
| J8 | Get-to-know-you games, connect-tier layers, richer Moments gates | ⊘ | On the design-workshop docket (`docs/DOCKET.md`), not the demo |
| J9 | Bare `/events` index, `polls.suggest_deadline`, unused `venues.url` / `zones.starts_at` | ⊘ | Cosmetic / vestigial; nothing links to them |

---

### How to read the result of the review

- Every **A–H** row that isn't ✅ is either a **◑ needs-ops** item (client action,
  Section I) or a **⊘ agreed exclusion** (Section J) — there are no silent gaps.
- If a ✅ row doesn't behave as its **Verify** note says when you exercise it in
  the app, that's a genuine regression to file — capture the route and the
  observed behavior.
- The six ◑ items in the body all trace back to Section I; closing I1–I8 lights
  them up without any further code.
