# Switchboard v1 - Design Spec
*2026-07-03 · approved by Tennyson*

## Product frame
Switchboard sells **permission** - every screen reduces the social risk of reaching out. Design invariant: *nothing is revealed unless both sides choose it; nothing nags; calm over urgency.*

## Decisions
- **Platform:** Mobile-first PWA (Next.js App Router, TypeScript), installable, web push
- **Backend:** Supabase - Postgres + Auth (username/password + Google) + RLS + Realtime
- **AI:** Claude API - Haiku (Living Room extraction, serendipity scoring), Sonnet (Discovery curation). Behind `AI_ENABLED` flag until `ANTHROPIC_API_KEY` present
- **Deploy:** GitHub + Vercel preview
- **Styling:** Tailwind v4, tokens as CSS custom properties

## Design direction - "Warm editorial calm"
Cream/paper surfaces, deep ink text, terracotta accent, sage green reserved semantically for availability/acceptance. Fraunces (display) + Inter (UI). Soft depth, generous whitespace, motion only where it clarifies (cascade flow, match reveal). Light-warm theme; no auto dark mode.

## Data model
| Table | Purpose |
|---|---|
| `profiles` | identity, avatar, bio, interests[], quiet hours |
| `circles`, `circle_members` | named audiences reused everywhere |
| `connections` | mutual friendships (request → accept) |
| `events` | title/time/place/capacity/host/visibility/status |
| `invites` | cascade state machine: position, group_stage, response window, status `queued→sent→accepted/declined/expired` |
| `polls`, `poll_options`, `votes` | Anonymous Weighted Input; weight −1..+2 |
| `mutual_intents` | author-only-readable interest (activity × person), `down_to_connect` / `open_to_reschedule` |
| `matches` | created server-side when intents mirror |
| `availability_signals` | emoji signal + audience circle + expiry |
| `rooms`, `messages`, `room_items` | Living Rooms; items = AI-extracted {event/address/task/link/photo/note} |
| `moments` | Shared Moments check-ins: place + experiences[] + prefs; three-consent flow |
| `guest_invites` | tokenized RSVP for non-users |

### Security invariants (RLS + security-definer functions)
1. Individual AWI votes are **never** readable - aggregates only via DB function
2. `mutual_intents` readable **only by author**; matching runs in security-definer fn - target never sees unrequited interest
3. Cascade advancement is server-authoritative: Vercel cron (1-min sweep) + lazy advancement on event read

## Feature slices (all ship in v1)
1. **Cascading Invites** - wizard stepper (details → mode → drag-rank invitees → windows → visibility → review), Individual + Group-stage modes, host cascade progress view
2. **Anonymous Weighted Input** - suggestions → private weighted ranking (love/good/rather-not) → deadline → resolution (host pick / auto / runoff)
3. **Mutual Mode** - activity × people grid, Down to Connect, symmetric Realtime match, match → chat → convert to event, Open to Reschedule handshake
4. **Smart Activity Discovery** - conversational preferences → Claude-curated cards with "why this" → one tap into event/AWI/cascade
5. **Live Availability Signals** - one-tap from home, per-signal audience, auto-expiry
6. **Digital Living Rooms** - chat + async Haiku pass files messages into Details/Photos/Tasks/Links/Places tabs; search
7. **Shared Moments** - check-in + experiences + comfort zone → three-consent (open → learn more → mutual reveal) → chat

## 10 safe-bet innovations (in v1 scope)
1. Guest RSVP token links (no-account accept/decline)
2. Cascade preview simulator
3. Graceful declines that teach ("Can't this time - keep asking!" vs "Not my thing")
4. Smart response-window suggestions from event lead time
5. Circles set up once at onboarding
6. Consensus meter (anonymous live satisfaction bar)
7. Add-to-calendar (ICS + Google link)
8. Quiet hours + digest
9. Shareable event pages with dynamic OG images
10. PWA install + web push

*(10 bolder ideas delivered as a review doc after v1.)*

## Testing
- Vitest: cascade state machine, weighted scoring, window suggestion (pure fns, TDD)
- RLS anonymity invariants: dedicated SQL tests
- Playwright: create→cascade→accept; vote→resolve; mutual match. Visual checks 320/768/1440
- Rate limiting on guest RSVP + auth; CSP headers

## Delivery
`~/dev/switchboard` → GitHub → Vercel preview → new Supabase project.
