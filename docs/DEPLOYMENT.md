# Deploying Switchboard

Two things run in production: the **app** (on Vercel) and the **database** (on
Supabase). A push to `main` first applies and verifies the database migrations,
then triggers exactly one Vercel production build. Vercel's direct Git deploy
for `main` is disabled in `vercel.json`, so app code cannot outrun the schema it
expects.

## What a "migration" is

A migration is a `.sql` file in `supabase/migrations/` that changes the database
structure (a table, a security rule, a function). It is **not** moving data
between databases. Each file is a numbered step; applying them in order brings a
database up to what the current app code expects. New app features that touch the
database ship with a new migration file, and that file has to be **run against
the live database** or the feature has no backend.

## Applying migrations — two options

### Option A — automatic (recommended)

`.github/workflows/deploy-migrations.yml` is the only production release path.
On every push to `main`, it:

1. verifies every required secret before changing production;
2. serializes with any earlier database push instead of cancelling it;
3. applies migrations and checks that none remain pending; and
4. calls the Vercel deploy hook only after schema parity passes.

The job uses the GitHub `production` environment and requires three repository
or environment secrets (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_ID` | your project ref — the subdomain of your project URL (e.g. `cuzgighqdzypntmhxrqc`) |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel Project → Settings → Git → Deploy Hooks; create one named `production-after-schema` for `main` |

**The job fails closed.** If any secret is missing, it errors before touching the
database. A failed migration or parity check never calls Vercel. A failed deploy
hook leaves the workflow red and visible rather than pretending the release
finished. The hook URL is a bearer credential: never print it, put it in source,
or reuse it outside this workflow.

Preview deployments are unchanged. Pushes to non-`main` branches still use the
Vercel Git integration; only the production branch is gated.

**First-run note:** `supabase db push` only applies migrations the database
doesn't already have (it tracks them in a `supabase_migrations` table). If your
database was set up by hand rather than by the CLI, the first push may try to
re-apply migrations that are already there and error with "already exists." If
that happens, either (a) start from a fresh Supabase project so the whole history
applies cleanly, or (b) run `supabase migration repair --status applied <version>`
for each already-applied migration once, then future pushes are automatic.

### Option B — manual, one-time (no setup)

In the dashboard SQL Editor
(`https://supabase.com/dashboard/project/<ref>/sql/new`), open each not-yet-applied
file in `supabase/migrations/` on GitHub, copy its contents, paste, and Run —
oldest to newest. Use this to clear a backlog; Option A handles everything after.

Do not trigger the production deploy hook after a partial or failed manual
migration. First run the workflow (or perform the same parity check) so the app
and schema cannot separate again.

## Rollback and recovery

Database migrations are forward-only. Do not edit or delete a migration that
has reached production, and do not try to reverse it by changing migration
history alone.

- **Migration or parity fails:** the deploy hook has not run, so production is
  still serving the previous compatible app. Fix the migration in a new commit
  (or add a forward repair migration) and let the workflow retry.
- **The new app is faulty but the schema is safe:** use Vercel's deployment
  history to roll back or promote the previous known-good deployment. Prefer a
  code rollback that remains compatible with the now-current schema.
- **The migration damaged production data or cannot be repaired forward:** stop
  releases, restore through Supabase Point-in-Time Recovery, then reconcile the
  restored schema and `supabase_migrations.schema_migrations` before deploying
  an app. Treat this as an incident; verify `/api/health` and the affected user
  journey before reopening releases.

After any rollback, rerun the migration workflow. A release is recovered only
when schema parity passes and the intended Vercel deployment is healthy.

## App environment variables

The app reads these (see `.env.example` for the full list). Set them in Vercel
(Project → Settings → Environment Variables):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client access
- `SUPABASE_SERVICE_ROLE_KEY` — server-only privileged access
- `NEXT_PUBLIC_APP_URL` — the app's public origin (used in emails/links)
- `CRON_SECRET` — required; the cron endpoint refuses to run without it
- `ANTHROPIC_API_KEY` — optional; AI features degrade gracefully without it
- `RESEND_API_KEY`, `EMAIL_FROM` — optional; off-platform email
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`,
  `CONTACT_VERIFICATION_SECRET` — required together for phone verification
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — optional; web push

## Scheduled work (cron)

`vercel.json` schedules two authenticated sweeps:

- `/api/cron/cascade` runs every minute to advance cascades, resolve due polls,
  fire reminders, and remove expired rows.
- `/api/cron/digest` runs at the top of every hour to reach each person's chosen
  local delivery hour. `digest_sent_at` keeps the result to one digest per day,
  even when a sweep retries.

**Sub-daily cron requires a Vercel Pro plan**; on the free (Hobby) tier cron
runs at most once per day, so time-based behavior and local-hour digest delivery
won't fire reliably. On Hobby, either upgrade or drive both endpoints from an
external scheduler (GitHub Actions cron, Upstash, cron-job.org) with an
`Authorization: Bearer $CRON_SECRET` header.

## Appointing moderators

The moderation queue (`/moderation`) is gated to appointed platform moderators.
There is deliberately no in-app way to grant this (authority never lives on a
self-writable row). Appoint someone via the dashboard SQL editor:

```sql
insert into public.platform_moderators (member_id)
values ('<the-profile-uuid>');
```

They'll then see a Moderation entry in Settings and can review open reports.
