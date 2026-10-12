# Switchboard: Next Stage Proposal

Draft of October 9, 2026

## Summary

The next stage turns Switchboard from a working web app into a fundable, installable product in five stages: an investor deck and demo, iOS and Android store releases, and a short list of integrations that make the app useful on day one.

Switchboard does two things at once, and the pitch has to carry both. It makes plans without pressure, with cascading invites, private group polls and plan rooms. It also helps people meet new people without exposing them, with Open Table, people discovery, Mutual, shared moments and serendipity zones. Both fail for the same reason in the world today: asking is socially costly. Both are fixed by the same mechanism: consent that is private until it is mutual.

The product is already built well past a prototype. It ships SMS, email and push delivery, calendar feeds, and a security and error-code discipline that most pre-seed products lack. What it does not have yet is a story an investor can hear in ten minutes, a way into the App Store and Google Play, or the connections to the tools people already use.

The proposal runs five stages in order. Each stage ends at an acceptance gate and is paid for when the gate is passed. An initiation fee opens the work, a completion fee closes it, and a monthly budget covers hosting, security and upkeep.

## Where we are today

Switchboard is a production mobile-first PWA at switchboardsocial.me, so the gap to "investor ready" is packaging and proof, not product.

| Area | State today | Source |
| --- | --- | --- |
| Stack | Next.js 16, Supabase (Postgres, Auth, RLS, Realtime), Claude API, Tailwind v4, Vercel | README |
| Making plans | Cascading invites, response windows, invite links with no account, private polls, availability grid, plan rooms | `src/lib/features.ts` |
| Meeting new people | Open Table, people discovery with friends, dating and networking lanes, Mutual, Play matchmaker, shared moments, serendipity zones, people near you, live map, neighborhood boards | `src/lib/features.ts` |
| Trust and safety | Mutual consent, nobody sees a no, block and report, moderator tools, verified school and work, 18+ terms | `docs/SECURITY.md`, `src/app/terms/page.tsx` |
| Delivery | Web push, Twilio SMS with a verified A2P campaign, Resend email, daily digest | `docs/SMS.md` |
| Calendar | ICS and webcal feeds already shipped | `src/app/api/calendar` |
| Imports | Partiful, Luma, Facebook, Apple Invites, Eventbrite links | feature index |
| Quality bar | 155 database migrations, pgTAP, Playwright E2E, unit tests, error codes, security doc | `docs/CI.md`, `docs/SECURITY.md` |
| Release path | Migrations applied and verified before each Vercel production deploy | `docs/DEPLOYMENT.md` |
| Native app | None. Installable PWA with a manifest, no iOS or Android project | `src/app/manifest.ts` |
| Investor material | None in the repo | n/a |

Three facts shape the plan. First, the product is deliberately calm and reveals itself one surface at a time, which is a strength for users and a weakness in a demo, so the demo needs a scripted path. Second, there is no native shell, so store launch is a new build target, not a polish pass. Third, meeting new people is a headline feature that also carries the most review and investor scrutiny, so trust and safety gets its own material instead of a footnote.

## Goals and success metrics

The stage succeeds if all four exits below are true at completion. Targets are proposed and open to change.

| Workstream | Exit criterion | How we know |
| --- | --- | --- |
| Pitch deck | 14 slide deck that gives planning and meeting new people equal weight, a one-page summary, a trust and safety one-pager and a data-room folder | Reviewed by two outside readers who were not told the product, who can state both halves back |
| Demo | A 5-minute scripted demo in two acts and a 2-minute video that run on seeded data with no live dependencies | Three clean dry runs in a row, including on bad wifi |
| App stores | iOS and Android builds approved and publicly listed | Live store listings and a working install from each |
| Integrations | Calendar, contacts, location and push work natively; payments or ticketing scoped and decided | Each integration has an E2E test and an owner-approved scope |

A retention or growth target belongs here too, but it needs your current user numbers first (see Decisions).

## Workstream 1: Investor pitch deck

The deck's job is to make one idea memorable: the hardest part of being social is asking, whether you are asking friends to a plan or asking a stranger to connect, and Switchboard removes that cost for both. The product brief already gives the voice (warm, direct, quietly playful) and the anti-references (no address-book spam, no manipulative growth loops), which is a differentiator worth stating on a slide.

The two halves feed each other, and the deck should show that as one loop:

1. A host makes a plan and invites people in order, with no pressure.
2. Open Table, discovery and zones put new people in reach of that plan or place.
3. Mutual consent turns a new face into a connection, privately, with no public rejection.
4. That connection becomes a guest on the next plan.

Proposed structure, 14 slides:

1. Title and one-line promise: "Plans without the pressure"
2. The problem: two awkward things, asking people to do something and meeting people you do not know yet, with one fear underneath
3. Why now: why group chats, event pages and social apps leave both unsolved (to be validated with real screenshots)
4. The product as one loop: plan, meet, connect, plan again
5. Making plans: cascading invites and private group decisions, in three screens
6. Meeting new people: Open Table, people discovery lanes, Mutual, shared moments and zones, in three screens
7. Trust by design: private until mutual, nobody sees a no, verified school and work, block and report, enforced in the database
8. Traction: users, plans created, response and acceptance rates, and connection outcomes such as Open Table requests approved and Mutual matches (needs your real numbers)
9. Market: two markets sized bottom-up, group planning and social discovery, sourced
10. Business model: options to choose between (see Decisions), including venue partnerships since Partner perks already ship
11. Go-to-market: invite links that work with no account, zones seeded at conferences, campuses and festivals, then a store launch
12. Moat and defensibility: the consent model, a graph built from real plans, and a clean safety record
13. Team and roadmap: the next 12 months, drawn from `docs/INNOVATIONS.md`
14. The ask: amount, use of funds, milestones it buys

Deliverables: the deck, a one-page summary, a trust and safety one-pager, a financial model with assumptions visible, an FAQ of hard investor questions (expect "is this a dating app" and "how do you keep strangers safe"), and a data-room folder. I would build the deck in Canva or as a slides artifact from this outline, whichever you prefer, and keep every claim tied to a source or a number you confirm.

I will not invent traction, market size, or valuation figures. Those slides stay marked as placeholders until you supply the data.

## Workstream 2: Investor demo

The demo is a rehearsed path through the real app on a sandbox project, not a click-through mockup. Most of the machinery exists: `npm run seed:discovery-demo` already populates the map, zones, plans, people, boards, Mutual and matchmaker data around Salt Lake City, and `/tour` already holds self-playing walkthroughs.

What is missing, and what I would build:

- **A dedicated demo environment.** A separate Supabase project and Vercel preview with a fixed seed, so a real user's data is never on screen and a failed deploy cannot break a pitch.
- **A reset button.** One command returns the sandbox to the exact opening state, including the live-presence layer that the seed script says expires after at most 8 hours.
- **A two-device script.** Both acts are best shown with two phones side by side, one for the host and one for the guest.
- **A 5-minute live path and a 2-minute video.** Same story, so the video doubles as the fallback if wifi fails.
- **Provider-safe messaging.** SMS and email run against a test recipient only, per the rule in `docs/SMS.md` that live command exchanges need an explicitly authorized recipient.
- **Walkthrough check.** Per `AGENTS.md`, any flow I touch gets its tour scene and caption updated in the same change.

Act 1, making a plan (about 2.5 minutes): describe a plan aloud, preview the cascade, send it, the first guest declines, the next is asked, the chain stops on a yes, then open the invite link on a phone with no account and answer.

Act 2, meeting someone new (about 2.5 minutes): the same plan has an Open Table seat, so a friend-of-friend on the second phone swipes to ask and the host approves. Then open people discovery, show the friends and networking lanes, send a Mutual signal from both phones, and show it stay invisible until the second one lands. Close on a shared moment at a zone, where each person steps through three consents before either is revealed.

The seed data already covers discovery, but I would check that the Mutual and Open Table paths are reproducible from a clean reset before the first dry run, because the seed notes say seeing other sharers is mutual and only your own check-ins plot on the map.

## Workstream 3: App store launch

I recommend wrapping the existing app with Capacitor and adding real native capabilities, rather than rewriting in React Native. It reuses the whole codebase, keeps one release path, and fits a small team. The risk is Apple's review guideline against thin web wrappers, so the wrapper must earn its place with native push, contacts, location, share sheet, haptics, and deep links.

| Option | Effort | Reuses current code | Store risk |
| --- | --- | --- | --- |
| Capacitor wrapper with native plugins (recommended) | Low to medium | All of it | Medium, managed by real native features |
| React Native rewrite | High | Logic only, UI rebuilt | Low |
| Android TWA plus iOS PWA only | Lowest | All of it | iOS has no store presence |

Work inside this workstream:

1. **Accounts and identity.** Apple Developer Program and Google Play Console, under a company entity, with the bundle ID and signing keys held in a password manager.
2. **Native shell.** iOS and Android projects, splash and icons built from the existing icon set, safe areas, and the hosted app loaded over HTTPS.
3. **Deep and universal links.** Invite links at `/i/<token>` and `/join/<id>` must open in the app when installed and in the browser when not, without breaking the no-account guest path documented in `AGENTS.md`.
4. **Native push.** APNs and FCM tokens alongside today's web push, with the same quiet hours and channel preferences.
5. **Contacts and location.** The native contact picker, replacing the browser-only fallback in `PRODUCT.md`, and native location permission with plain-language purpose text for zones, shared moments and live map sharing.
6. **Review readiness.** In-app account deletion (already built), user reporting and blocking for user-generated content (moderation exists), privacy nutrition label, Google Data Safety form, an age rating that matches the 18+ terms and the discovery lanes, and a demo account with seeded data for the reviewer. Features that introduce people to each other get the most reviewer attention, so the listing and review notes explain mutual consent and safety tools up front.
7. **Listing.** Screenshots that show both halves of the product, preview video, description, keywords, support and privacy URLs, and a TestFlight and Play internal track beta before submission.

If sign-in offers any third-party social login, Apple requires Sign in with Apple as well. I have not confirmed which sign-in methods ship today; `docs/AUTH.md` is the place to check before this step.

Plan for one rejected review cycle on iOS. Apple fees are currently $99 per year and Google's one-time fee is $25.

## Workstream 4: Full integrations

"Full" needs a boundary, or it grows without end. I propose three tiers: finish what is half-built, add what the store launch requires, and scope the rest for after funding. Each integration must pass the security rules in `docs/SECURITY.md` before it ships, since the database is the security boundary.

| Integration | Tier | Today | Plan |
| --- | --- | --- | --- |
| Calendar (Apple, Google, Outlook) | 1 | ICS and webcal feeds | Add one-tap "add to calendar" on native, and a two-way Google Calendar option as a stretch |
| Native push (APNs, FCM) | 1 | Web push with VAPID | Device tokens, same preference and quiet-hours rules |
| Contacts | 1 | Browser contact picker with fallback | Native picker, results never uploaded wholesale |
| Location | 1 | Browser geolocation, same-origin only | Native permission, foreground use only, same blur and opt-in rules as the live map |
| Deep links and share sheet | 1 | Invite links with no account needed | Universal links, native share sheet |
| SMS and email | 1 | Twilio and Resend, A2P campaign verified | Harden for volume, keep the operator controls in `docs/SMS.md` |
| Analytics and crash reporting | 1 | PostHog | Add native crash reporting, store-ready consent |
| Event import | 2 | Partiful, Luma, Facebook, Apple Invites, Eventbrite links | Keep working as providers change their pages |
| Maps and places | 2 | MapLibre | Place search and directions hand-off to the system maps app |
| Sign in with Apple and Google | 2 | To be confirmed against `docs/AUTH.md` | Required by Apple if any social login exists |
| Payments or ticketing | 3 | None | Scope only, decide model with investors first |
| Messaging apps, Slack, Teams | 3 | None | Scope only, no build this stage |

Tier 1 is committed. Tier 2 is built once the native stage is stable. Tier 3 is a written scope that also feeds the roadmap slide in the deck.

## Stages

Work moves through five stages. Each one has a fixed deliverable and an acceptance gate, and the next stage does not start until the gate is passed. No dates are set here; they follow from when the initiation fee is agreed.

| Stage | What gets built | Acceptance gate | Payment |
| --- | --- | --- | --- |
| 1. Foundation | Scope locked, native approach confirmed, store accounts and signing set up, demo sandbox provisioned, traction data gathered | Written scope signed off, store accounts verified | Stage 1 fee |
| 2. Investor package | Pitch deck, one-page summary, trust and safety one-pager, financial model, seeded demo environment with reset command, two-act 5-minute script, 2-minute video | Three clean dry runs, deck reviewed by two outside readers | Stage 2 fee |
| 3. Native build | Capacitor shell for iOS and Android, native push, contacts, location, deep and universal links, share sheet, Tier 1 integrations | Builds pass the invite-link E2E on real devices, guest path still works with no account | Stage 3 fee |
| 4. Integrations and beta | Tier 2 integrations, TestFlight and Play beta, review-readiness items, store listing assets | Beta feedback triaged, store forms and listing complete | Stage 4 fee |
| 5. Store launch and handover | Submission, review fixes, public release, runbook, Tier 3 scope document | Live in both stores | Stage 5 fee, then completion fee |

## Fees and payment

Four kinds of payment cover the work, and none of the amounts are set yet. There are no payroll, rate or vendor quotes on file, so each amount is left for you to fill.

| Payment | When it is due | What it covers | Amount |
| --- | --- | --- | --- |
| Initiation fee | On agreement, before Stage 1 starts | Scoping, accounts, signing keys, sandbox provisioning, project setup | To be set |
| Stage fees (five) | When each stage's acceptance gate is passed | The deliverables listed for that stage | To be set per stage |
| Completion fee | When both store listings are live and handover is done | Final release, runbook, Tier 3 scope document, transfer of keys and accounts | To be set |
| Monthly hosting, security and upkeep | Every month | Vercel and Supabase hosting, monitoring, security patching, dependency and migration upkeep, store policy updates, incident response | To be set per month |

Three points to settle in this structure:

- **Pass-through costs.** Apple's developer fee is currently $99 per year and Google's registration is a one-time $25. SMS and email usage (Twilio, Resend) follows the limits in `docs/SMS.md` and is easiest to bill at cost, outside the monthly budget.
- **When the monthly budget starts.** Hosting for the demo sandbox begins early, while upkeep of a live product begins at release. I suggest starting it at the Stage 5 gate unless you want it earlier.
- **Who holds the accounts.** Apple, Google, Supabase and Vercel accounts should sit under your entity, so the monthly budget pays for management of them, not ownership.

## Risks and mitigations

The biggest risks are Apple rejecting the app as a thin web wrapper, and the extra scrutiny that comes with features that introduce strangers to each other.

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| iOS review rejects a wrapper-style app | Medium | Ship real native push, contacts, location, share sheet and deep links; submit a TestFlight beta first; budget one resubmission |
| Reviewers or investors read the meeting-people features as an unsafe dating app | Medium | Lead with mutual consent and the safety tools, state the 18+ rule and context-specific matching, ship the trust and safety one-pager, keep block, report and moderation visible in the demo |
| Store review takes longer than expected | Medium | Submit early in Stage 5 and keep a resubmission in scope |
| Native push or deep links break the no-account guest path | Medium | Extend `e2e/invite-links.spec.ts` to run against the native shell before submission |
| Native location permission is refused and discovery looks empty | Medium | Keep every discovery surface useful without location, explain the purpose before the system prompt |
| A new blocked-account state appears with native sign-in | Low | Follow `docs/AUTH.md` and the blocked-account table in `src/lib/actions/auth.test.ts` |
| Demo fails live | Medium | Separate sandbox, reset command, recorded video fallback |
| Traction numbers are thin | Unknown | Lead the deck with product depth and the quality of connections made, and collect numbers early in Stage 1 |
| Integration scope grows | High | Tiers 1 to 3 are fixed in writing; Tier 3 is scope only |
| Third-party providers change (import links, SMS rules) | Medium | Keep SMS controls from `docs/SMS.md`, add monitoring on import failures |

## Decisions needed from you

- [ ] **Native approach.** Capacitor wrapper (recommended) or a React Native rewrite.
- [ ] **Headline order.** The deck gives planning and meeting new people equal weight and shows them as one loop. Confirm that, or choose which one leads.
- [ ] **Traction numbers.** Current users, plans created, acceptance rates, and any connection outcomes (Open Table approvals, Mutual matches) for the deck.
- [ ] **Raise terms.** Target amount, instrument, and the milestones it should buy.
- [ ] **Business model.** Subscription, host-paid plans, venue and event partnerships, or undecided for now.
- [ ] **Legal entity.** Which entity owns the Apple and Google accounts.
- [ ] **Sign-in methods.** Confirm whether any social login exists today, which decides whether Sign in with Apple is required.
- [ ] **Integration scope.** Approve Tier 1 and Tier 2, and confirm Tier 3 is scope only.
- [ ] **Deck tooling.** Canva, a slides artifact, or a PowerPoint file.
- [ ] **Start date.** Stage 1 begins once the initiation fee is agreed.
