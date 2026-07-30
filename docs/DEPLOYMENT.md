# Deploying Switchboard

Two things run in production: the **app** (on Vercel) and the **database** (on
Supabase). The app is deployed automatically by Vercel on every push. The
database needs its migration scripts applied — this doc covers how.

## What a "migration" is

A migration is a `.sql` file in `supabase/migrations/` that changes the database
structure (a table, a security rule, a function). It is **not** moving data
between databases. Each file is a numbered step; applying them in order brings a
database up to what the current app code expects. New app features that touch the
database ship with a new migration file, and that file has to be **run against
the live database** or the feature has no backend.

## Applying migrations — two options

### Option A — automatic (recommended)

`.github/workflows/deploy-migrations.yml` runs `supabase db push` on every merge
to `main`, so new migrations apply themselves. It requires three repository
secrets (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_ID` | your project ref — the subdomain of your project URL (e.g. `cuzgighqdzypntmhxrqc`) |
| `SUPABASE_DB_PASSWORD` | Project Settings → Database → Connection info |

**The job fails closed.** If any of those secrets is missing, the workflow errors
(with the missing names) instead of passing — so a merge can never report a green
deploy while the database is left behind. After a push it also verifies schema
parity (no committed migration still pending). Until you set the secrets, expect
this workflow to be red on `main`; that is the intended signal, not a break.

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

`vercel.json` schedules `/api/cron/cascade` every minute — it advances cascades,
resolves due polls, fires reminders, and sweeps expired rows. **Sub-daily cron
requires a Vercel Pro plan**; on the free (Hobby) tier cron runs at most once per
day, so time-based behavior won't fire reliably. On Hobby, either upgrade or
drive the endpoint from an external scheduler (GitHub Actions cron, Upstash,
cron-job.org) with an `Authorization: Bearer $CRON_SECRET` header.

## Appointing moderators

The moderation queue (`/moderation`) is gated to appointed platform moderators.
There is deliberately no in-app way to grant this (authority never lives on a
self-writable row). Appoint someone via the dashboard SQL editor:

```sql
insert into public.platform_moderators (member_id)
values ('<the-profile-uuid>');
```

They'll then see a Moderation entry in Settings and can review open reports.
