-- Report a board post, not just the person who wrote it.
--
-- `user_reports` could only ever name a *person*, so the only way to flag a
-- specific post was to report its author and describe the post in prose. A
-- moderator then had to find it by hand, and by the time they looked the author
-- may have posted a dozen more. Reporting the person for one bad post is also a
-- heavier act than the reporter usually means.
--
-- This extends the existing table rather than adding a parallel one, on purpose.
-- `20260713170000_moderation_queue` already built resolution tracking, the
-- `platform_moderators` authority table, and the security-definer accessors that
-- are a moderator's only door in. A second reports table would need all of that
-- again — and the second copy is the one that drifts out of step. One queue,
-- one resolution path, one place a moderator looks.
--
-- `reported_id` stays NOT NULL and still names the author. That keeps the
-- existing FK, the `reporter_id <> reported_id` self-report check, and every
-- moderator query working unchanged — and it is the truthful answer to "whose
-- content is this?", which is what a queue about conduct needs.

alter table public.user_reports
  add column if not exists target_kind text not null default 'profile'
    check (target_kind in ('profile', 'board_post')),
  add column if not exists target_id uuid references public.board_posts(id) on delete cascade;

-- A post report without a post is a profile report wearing the wrong label, and
-- a profile report carrying a post id is ambiguous about what was actually
-- being flagged. Neither is allowed to exist.
alter table public.user_reports
  drop constraint if exists user_reports_target_matches_kind;
alter table public.user_reports
  add constraint user_reports_target_matches_kind check (
    (target_kind = 'profile' and target_id is null)
    or (target_kind = 'board_post' and target_id is not null)
  );

-- The same person may report several different posts; they may not file the
-- same report twice. Partial, because profile reports have no target to key on.
create unique index if not exists user_reports_one_per_post_idx
  on public.user_reports (reporter_id, target_id)
  where target_kind = 'board_post';

-- The queue now carries what was reported, so a moderator can read the post
-- itself instead of reconstructing it from the reporter's description.
--
-- Deliberately returns the post's own text rather than a link: a post deleted
-- between report and review would otherwise leave the moderator with nothing to
-- judge, and `on delete cascade` above means the report goes with it. The join
-- is a LEFT join so a profile report still lists.
drop function if exists public.list_open_reports();
create or replace function public.list_open_reports()
returns table (
  id uuid,
  reason text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reported_handle text,
  target_kind text,
  target_id uuid,
  target_title text,
  target_body text
) language sql stable security definer set search_path = public as $$
  select r.id, r.reason, r.created_at,
         r.reporter_id, rp.display_name,
         r.reported_id, tp.display_name, tp.handle,
         r.target_kind, r.target_id, bp.title, bp.body
  from public.user_reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles tp on tp.id = r.reported_id
  left join public.board_posts bp on bp.id = r.target_id
  where r.status = 'open'
    and public.is_platform_moderator(auth.uid())
  order by r.created_at asc;
$$;
revoke all on function public.list_open_reports() from public, anon;
grant execute on function public.list_open_reports() to authenticated;

-- The insert policy is unchanged and still says the only thing that matters
-- here: you may file a report as yourself and nobody else. Reading stays
-- reporter-only; `list_open_reports` remains the moderator's only door in.
