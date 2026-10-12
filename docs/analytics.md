# Analytics

Switchboard measures the **one thing that matters: real gatherings that actually
happened**, not screen time or daily logins. Analytics is a bonus layer, exactly
like AI and email: it is a no-op until `POSTHOG_KEY` is set, and it never blocks
or slows a user action.

## How it works

Two layers, both no-ops until their key is set, both "bonus, never a blocker":

- **Server-side funnel** — PostHog's HTTP capture API (`src/lib/analytics/server.ts`).
  No cookies, no client key. The core funnel below lives in server actions, so it
  is captured reliably and privately. Set `POSTHOG_KEY` (and optionally
  `POSTHOG_HOST`, default `https://us.i.posthog.com`) to turn it on.
- **Client-side SDK** — `posthog-js`, mounted in the root layout via
  `src/components/system/PostHogProvider.tsx`. Covers **web/performance analytics**
  (pageviews, Web Vitals) and **error tracking** (unhandled exceptions surface as
  issues in PostHog). Set `NEXT_PUBLIC_POSTHOG_KEY` (same `phc_` project token —
  it is public and ships to the browser) to turn it on. Session replay is off.

Both leave dev quiet if you leave the keys unset. Every event — client and
server — carries `app: "switchboard"` so this product's data stays cleanly
separable from anything else sharing the PostHog project.

### Secret-link pages are never captured

`before_send` (`src/lib/analytics/before-send.ts`) drops every client event
captured on `/proposal/<token>` and redacts that path from any other event, so a
bearer token in a URL never reaches PostHog. Add the prefix there when a new page
authorizes by a secret path segment.

### The `/ingest` reverse proxy

The browser SDK talks to a **same-origin** path, `/ingest`, which `next.config.ts`
rewrites to PostHog's ingestion and asset hosts. This keeps every request and
lazily-loaded script `'self'` under the strict per-request CSP (`src/proxy.ts`) —
no `script-src`/`connect-src` widening — and evades ad-blockers. `/ingest` is
excluded from the auth proxy's matcher so beacons never hit Supabase.

## The North Star

**Plans-That-Happened** — a plan that actually occurred with real people. It
cannot be inflated by more scrolling or notifications; it only rises when the
product succeeds at its mission.

## Events we track (and why)

| Event | Fired from | Properties | Why |
|---|---|---|---|
| `plan_created` | `createEvent` | `invite_mode`, `has_poll` | Habit + the top of the activation funnel. |
| `plan_happened` | `markHappened` | `event_id`, `attendee_count` | **North Star.** A host affirmed the plan occurred. |
| `invite_responded` | `respondToInvite` | `accepted`, `outcome`, `decline_note`, `has_message` | Invitation health, acceptance rate, and whether graceful declines are used (reason category and a boolean only — never the note's text). |
| `poll_voted` | `castVote` | `event_id` only | Habit + time-to-decision. |
| `pmf_survey_response` | `submitPmf` | `choice` | Sean Ellis product-market-fit signal. |
| `signup_completed` | `createPasswordAccount` | `method` (`email`/`username`) | Top of the funnel. (Google OAuth signups are not captured here.) |
| `onboarding_completed` | `completeOnboarding` | `interest_count`, `down_to_count` | Signup→active conversion; counts only, never the interest strings. |
| `board_post_created` | `addBoardPost` | `kind` | Do offers/requests get used at all? Kind only, never title/body. |
| `board_post_response` | `respondToBoardPost` | `kind` | Requests receiving a response — the loop-closure rate. |
| `board_post_fulfilled` | `fulfillBoardPost` | `kind` | Offers/requests that actually resolved. |

Derive activation (first `plan_happened` within 14 days of signup), habit
(created or responded in a rolling 30 days), and time-to-plan from these.

## The anonymity guardrail

We **never** attach the content of a message, a poll vote's weight/option, or a
mutual intent to any event. `poll_voted` carries the event id only. The database
enforces the anonymity invariants; analytics must not undo them.

## PMF survey

The Sean Ellis question ("How would you feel if you could no longer use
Switchboard?") shows once, on Home, dismissibly, and **only** when
`NEXT_PUBLIC_PMF_ENABLED=1`. Off by default so it never nags. Target is ≥40%
"very disappointed".

## Client-side capture (performance + errors)

The browser SDK adds, behind `NEXT_PUBLIC_POSTHOG_KEY`:

- **Pageviews & pageleaves** — automatic across App Router client navigations.
- **Web Vitals** — LCP, INP, CLS, etc., for performance analytics.
- **Autocaptured interactions** — clicks and form activity (shape only).
- **Error tracking** — unhandled exceptions and promise rejections become
  PostHog issues.

Client capture is **anonymous by design**: we do not call `posthog.identify`, so
errors and performance are tracked per-session without tying them to a user —
consistent with Switchboard's anonymity posture. If you later want authenticated
debugging, identify with the Supabase user id at sign-in (and reset on sign-out),
but weigh it against the anonymity guardrail first. Session replay is intentionally
left off (`disable_session_recording`).

The anonymity guardrail still applies: never attach message, poll-vote, or
mutual-intent **content** to any event, client or server.
