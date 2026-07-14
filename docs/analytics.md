# Analytics

Switchboard measures the **one thing that matters: real gatherings that actually
happened**, not screen time or daily logins. Analytics is a bonus layer, exactly
like AI and email: it is a no-op until `POSTHOG_KEY` is set, and it never blocks
or slows a user action.

## How it works

- Server-side only, via PostHog's HTTP capture API (`src/lib/analytics/server.ts`).
  No browser SDK, no cookies, no client key. The core funnel lives in server
  actions, so it is captured reliably and privately.
- Set `POSTHOG_KEY` (and optionally `POSTHOG_HOST`, default `https://us.i.posthog.com`)
  to turn it on. Leave unset in dev and it does nothing.

## The North Star

**Plans-That-Happened** — a plan that actually occurred with real people. It
cannot be inflated by more scrolling or notifications; it only rises when the
product succeeds at its mission.

## Events we track (and why)

| Event | Fired from | Properties | Why |
|---|---|---|---|
| `plan_created` | `createEvent` | `invite_mode`, `has_poll` | Habit + the top of the activation funnel. |
| `plan_happened` | `markHappened` | `event_id`, `attendee_count` | **North Star.** A host affirmed the plan occurred. |
| `invite_responded` | `respondToInvite` | `accepted`, `outcome` | Invitation health and acceptance rate. |
| `poll_voted` | `castVote` | `event_id` only | Habit + time-to-decision. |
| `pmf_survey_response` | `submitPmf` | `choice` | Sean Ellis product-market-fit signal. |

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

## Deliberately not yet tracked

Client-side pageviews, session length, and notifications-per-user (the guardrail
anti-goals) need a browser SDK behind a reverse-proxy rewrite (`/ingest`). Add
that in a later pass if you want those; the server funnel above is the priority.
