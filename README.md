# Switchboard

**Plans without the pressure.** Switchboard removes the social friction from
making plans, deciding together, and keeping the details in one calm place.

Mobile-first PWA · Next.js 16 (App Router) · Supabase (Postgres, Auth, RLS, Realtime) · Claude API · Tailwind v4.

## What ships

[`src/lib/features.ts`](src/lib/features.ts) is the single catalogue of shipped
features, how they help, and where to find them. The app renders it at
`/features`, and `src/lib/features.test.ts` verifies that every listed route is
real and every product page is accounted for. Roadmap ideas live separately in
[`docs/INNOVATIONS.md`](docs/INNOVATIONS.md).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys (see below)
npm run dev
```

1. Start a local database with the [Supabase CLI](https://supabase.com/docs/guides/local-development)
   (Docker required): `supabase start` applies every file in
   `supabase/migrations/` in order. Run `supabase init` first if there is no
   `supabase/config.toml`. For a hosted project, `supabase link` then
   `supabase db push`; never paste migrations by hand except to clear a backlog
   (see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)).
2. Put the API URL + anon key + service-role key that `supabase start` prints in `.env.local`.
3. Optional: `ANTHROPIC_API_KEY` for real AI features (graceful fallback without).
4. Optional: `npx web-push generate-vapid-keys` → enables push notifications.

To seed interactive local test profiles after Supabase is configured:

```bash
npm run seed:test-profiles
```

To populate every public-discovery surface (map, zones, moments, discover,
people, boards, mutual, matchmaker) with mock data geo-tagged around Salt Lake
City and wired to your own account so RLS lets you see it — 20 mock people, 9
anchored zones with people checked into them, plans across the valley, and live
location sharing:

```bash
# Targets the project your account lives in — confirm with SEED_ALLOW_NONLOCAL=1.
SEED_ALLOW_NONLOCAL=1 SEED_VIEWER_EMAIL=you@example.com npm run seed:discovery-demo
```

The viewer must have signed into the app once (so the profile exists). Re-runs
are idempotent — the script owns only its fixed set of demo rows.

Live presence is time-boxed the same way the product is (`SEED_LIVE_HOURS`, 1–8,
default 8), so **re-run the script to bring the Live layer back** once it has
expired. Two RLS facts explain the map's layer counts, and neither is a bug:
seeing other sharers is mutual (the seed shares on your behalf so the layer
isn't empty), and **Shared places plots your own check-ins only** — the app
allows one open check-in at a time, so that layer is 1. Everyone else's
check-ins show up as zone presence and as anonymized "someone's here too"
candidates instead.

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
npm run lint     # eslint
npx tsc --noEmit # typecheck
npm run build    # production build
supabase test db # pgTAP security tests against the local database
npm run e2e      # public browser tests; Playwright starts the dev server
E2E_DB=1 npm run e2e  # signed-in journeys too: seed first, see e2e/README.md
```

## Baseline checklist

- [ ] private repo + main protected + CI
- [x] dependabot + lockfile
- [ ] advisors clean (or exceptions noted)
- [ ] backups/PITR confirmed
- [x] PostHog + exceptions on
- [ ] uptime incl. checkout URL
- [x] privacy / terms / contact
- [ ] support email works
- [ ] domain auto-renew on
