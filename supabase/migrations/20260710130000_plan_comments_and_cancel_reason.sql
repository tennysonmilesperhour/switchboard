-- Voice notes across plans: a two-way comments thread under each plan, and an
-- optional spoken/written reason attached to a cancellation.
--
-- Audio itself lives in the existing public `media` storage bucket (per-user
-- folder write, public read — see 20260707120000_media_bucket.sql); these
-- columns/tables only hold the resulting URLs plus a duration for the player.

-- ————————————————————————— cancellation reason —————————————————————————
-- When a host calls off a plan they can now say why, in text and/or a voice
-- note. Both are surfaced on the (now cancelled) event page and folded into the
-- cancellation notification so nobody is left guessing.
alter table public.events
  add column if not exists cancel_reason text
    check (cancel_reason is null or char_length(cancel_reason) <= 2000),
  add column if not exists cancel_voice_url text;

-- ————————————————————————— plan comments —————————————————————————
-- A running conversation under a plan. Anyone who can see the event (host and
-- live invitees) can post, in text or as a voice note (or both). Unlike
-- host-only Announcements, this is two-way.
create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text check (body is null or char_length(body) between 1 and 2000),
  voice_url text,
  voice_duration_seconds int
    check (voice_duration_seconds is null or voice_duration_seconds between 0 and 600),
  created_at timestamptz not null default now(),
  -- A comment must carry something: written words, a voice note, or both.
  constraint event_comments_has_content check (body is not null or voice_url is not null),
  -- A voice note needs its audio; a duration without a URL is meaningless.
  constraint event_comments_voice_shape check (voice_duration_seconds is null or voice_url is not null)
);

create index if not exists event_comments_event_idx
  on public.event_comments (event_id, created_at desc);

alter table public.event_comments enable row level security;

-- Readable by anyone who can see the event: host, co-hosts, and live invitees.
drop policy if exists event_comments_select on public.event_comments;
create policy event_comments_select on public.event_comments for select to authenticated
  using (
    public.can_view_event(event_id, auth.uid())
    or public.is_event_host(event_id, auth.uid())
  );

-- You may only post as yourself, and only on plans you can see.
drop policy if exists event_comments_insert on public.event_comments;
create policy event_comments_insert on public.event_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.can_view_event(event_id, auth.uid())
      or public.is_event_host(event_id, auth.uid())
    )
  );

-- Authors delete their own comments; host/co-hosts moderate any on their plan.
drop policy if exists event_comments_delete on public.event_comments;
create policy event_comments_delete on public.event_comments for delete to authenticated
  using (
    author_id = auth.uid()
    or public.is_event_host(event_id, auth.uid())
  );
