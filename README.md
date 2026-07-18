# Switchboard

**Plans without the pressure.** Switchboard removes the social friction from
making plans: cascading invites, anonymous weighted group decisions,
mutual-interest matching, availability signals, self-organizing group chats,
AI activity discovery, and serendipitous shared moments.

Mobile-first PWA · Next.js 16 (App Router) · Supabase (Postgres, Auth, RLS, Realtime) · Claude API · Tailwind v4.

## Features

| Feature | What it does |
|---|---|
| 🪜 **Cascading Invites** | Invite people in your order - one at a time or in waves. Someone accepts → the flow stops. Includes a preview simulator and guest links. |
| 🗳️ **Anonymous Weighted Input** | Private, weighted ranking (love / good / rather-not). Consensus meter, auto / host-pick / runoff resolution. Individual votes are unreadable by design (RLS). |
| ◐ **Mutual Mode** | "Down to Connect" stays private unless it's mutual - matching happens inside a security-definer trigger, so unrequited interest is never observable. Includes "Open to Reschedule". |
| 🟢 **Availability Signals** | One-tap "Coffee Break?" visible only to the circles you choose. Auto-expires. No broadcasts. |
| ❋ **Digital Living Rooms** | Chat where addresses, tasks, links, and notes file themselves into tabs (Claude Haiku, with a zero-cost rules fallback). |
| 🧭 **Smart Activity Discovery** | Describe the experience → Claude Sonnet curates a handful of fits, each with a "why". One tap into a plan. |
| ✨ **Shared Moments** | Check in somewhere; three moments of consent (open → curious → 🤝) before anyone is revealed. |

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys (see below)
npm run dev
```

1. Create a Supabase project and run the SQL files in `supabase/migrations/` in timestamp order.
2. Put the project URL + anon key + service-role key in `.env.local`.
3. Optional: `ANTHROPIC_API_KEY` for real AI features (graceful fallback without).
4. Optional: `npx web-push generate-vapid-keys` → enables push notifications.

To seed interactive local test profiles after Supabase is configured:

```bash
npm run seed:test-profiles
```

To populate every public-discovery surface (map, zones, moments, discover,
people, boards, mutual) with mock data geo-tagged around Salt Lake City and
wired to your own account so RLS lets you see it:

```bash
# Targets the project your account lives in — confirm with SEED_ALLOW_NONLOCAL=1.
SEED_ALLOW_NONLOCAL=1 SEED_VIEWER_EMAIL=you@example.com npm run seed:discovery-demo
```

The viewer must have signed into the app once (so the profile exists). Re-runs
are idempotent — the script owns only its fixed set of demo rows.

## Architecture notes

- **Cascade logic lives once**, in `src/lib/engine/cascade.ts` (pure, unit-tested).
  The DB provides an atomic capacity-checked accept (`respond_to_invite`);
  advancement runs lazily on page load and via a 1-minute Vercel cron
  (`/api/cron/cascade`) as the guarantee.
- **Two anonymity invariants** are enforced at the database layer:
  1. `poll_votes` are selectable only by their author; the group sees
     aggregates via the `poll_results()` function.
  2. `mutual_intents` are selectable only by their author; matching happens
     in a trigger so a target never learns of unrequited interest.
- AI is a **bonus, never a blocker** - every AI path has a deterministic
  fallback and failures are swallowed into rule-based behavior.

## Scripts

```bash
npm run dev      # local dev
npm test         # vitest unit tests (cascade, scoring, windows)
npm run build    # production build
npx playwright test  # e2e (needs a running dev server + seeded env)
```
