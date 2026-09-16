-- Client feedback from the scope-of-work checklist.
--
-- The checklist at /scope-verification is walked by a client who has no account
-- and never will: it is a static page addressed by URL. So this is the one
-- intake in the app that cannot authenticate its writer, and the whole design
-- follows from that.
--
-- The compensations, because `docs/SECURITY.md` §7 otherwise requires a session
-- on any upload path:
--
--   * The bucket is PRIVATE. Nothing here is ever served from a public origin,
--     so the "crafted file.type comes back executable" class of bug cannot
--     apply. The report reads screenshots through short-lived signed URLs.
--   * The table has RLS on and NO policies at all. `anon` and `authenticated`
--     cannot select, insert, update or delete a row; only the service role,
--     which bypasses RLS, reaches it — and only from the one route that writes
--     it. There is no read path off the public internet.
--   * Every length and count bound is a CHECK here rather than only a guard in
--     the route, so the cap survives a second caller written later.
--
-- The route adds what SQL cannot: an IP rate limit that fails closed, a byte
-- cap, and a server-derived content type from an extension allowlist.

create table if not exists public.client_feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- Which checklist item this is about. Free text, not a foreign key: the
  -- checklist's ids (A1, J4…) live in a static HTML file, not in this database,
  -- and a report about the page in general carries no item at all.
  item_id text,
  item_label text,

  body text not null,

  -- Optional, so a report can say who asked. Whatever they typed; never trusted
  -- as identity, only quoted back.
  reporter text,

  -- Object paths inside the private `client-feedback` bucket.
  screenshots text[] not null default '{}',

  -- Triage state, written by the twice-daily job.
  --   new        nobody has looked at it yet
  --   in_progress  a fix is being written
  --   shipped    merged to main
  --   needs_you  a fix exists or is proposed but a human has to decide
  --   declined   deliberately not doing it; `resolution` says why
  status text not null default 'new',
  resolution text,
  resolved_at timestamptz,
  -- A commit sha, a PR url, or whatever names the outcome.
  resolved_ref text,

  constraint client_feedback_status_known
    check (status in ('new', 'in_progress', 'shipped', 'needs_you', 'declined')),
  constraint client_feedback_body_bounded
    check (char_length(body) between 1 and 4000),
  constraint client_feedback_reporter_bounded
    check (reporter is null or char_length(reporter) <= 80),
  constraint client_feedback_item_id_bounded
    check (item_id is null or char_length(item_id) <= 16),
  constraint client_feedback_item_label_bounded
    check (item_label is null or char_length(item_label) <= 200),
  constraint client_feedback_resolution_bounded
    check (resolution is null or char_length(resolution) <= 4000),
  constraint client_feedback_screenshots_bounded
    check (cardinality(screenshots) <= 4)
);

-- RLS on, and deliberately no policy for any role. A table with RLS enabled and
-- no policies denies everything to everyone except the service role. That is
-- the intent: this is a write-only drop box from the public internet, and the
-- only reader is the triage job running with the service key.
alter table public.client_feedback enable row level security;

-- The triage job's query is "everything not yet dealt with, oldest first".
create index if not exists client_feedback_open_idx
  on public.client_feedback (created_at)
  where status in ('new', 'in_progress');

-- Private bucket: no public read, and no policies, so only the service role
-- reads or writes objects. Screenshots of someone's phone are personal data;
-- they are not published anywhere by uploading them here.
insert into storage.buckets (id, name, public)
values ('client-feedback', 'client-feedback', false)
on conflict (id) do update set public = false;
