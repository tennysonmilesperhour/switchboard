-- Moderation review queue.
--
-- Users can already file user_reports, but nobody could review or action them:
-- RLS makes each report readable only by its reporter, and there was no
-- moderator concept. This adds the missing operator surface, following the
-- existing board-moderator precedent and docs/SECURITY.md:
--
--   1. Resolution tracking on user_reports (status/resolved_by/resolved_at/note).
--   2. A platform_moderators authority table that users CANNOT write — authority
--      never lives on a self-writable row (SECURITY.md §3). Moderators are
--      appointed only by service-role/SQL:
--        insert into public.platform_moderators (member_id) values ('<uuid>');
--   3. Security-definer accessors so an appointed moderator can list and resolve
--      reports, each self-checking membership. RLS on user_reports stays
--      reporter-only; these functions are the moderator's only door in.

alter table public.user_reports
  add column if not exists status text not null default 'open'
    check (status in ('open', 'resolved', 'dismissed')),
  add column if not exists resolved_by uuid references public.profiles(id),
  add column if not exists resolved_at timestamptz,
  add column if not exists resolution_note text;

create index if not exists user_reports_open_idx
  on public.user_reports (created_at)
  where status = 'open';

create table if not exists public.platform_moderators (
  member_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now()
);
alter table public.platform_moderators enable row level security;

-- Deny-all to users: there is deliberately NO insert/update/delete policy, so
-- moderator authority can only be granted by service-role/SQL. A moderator may
-- read their own row so the app can reveal the moderation entry point to them.
drop policy if exists platform_moderators_self on public.platform_moderators;
create policy platform_moderators_self on public.platform_moderators
  for select to authenticated using (member_id = auth.uid());

create or replace function public.is_platform_moderator(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.platform_moderators where member_id = p_user
  );
$$;
revoke all on function public.is_platform_moderator(uuid) from public, anon;
grant execute on function public.is_platform_moderator(uuid) to authenticated;

-- List open reports for the calling moderator. Returns the reporter/reported
-- display info so the queue is actionable. Non-moderators get an empty set.
create or replace function public.list_open_reports()
returns table (
  id uuid,
  reason text,
  created_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reported_id uuid,
  reported_name text,
  reported_handle text
) language sql stable security definer set search_path = public as $$
  select r.id, r.reason, r.created_at,
         r.reporter_id, rp.display_name,
         r.reported_id, tp.display_name, tp.handle
  from public.user_reports r
  join public.profiles rp on rp.id = r.reporter_id
  join public.profiles tp on tp.id = r.reported_id
  where r.status = 'open'
    and public.is_platform_moderator(auth.uid())
  order by r.created_at asc;
$$;
revoke all on function public.list_open_reports() from public, anon;
grant execute on function public.list_open_reports() to authenticated;

-- Resolve or dismiss a report. Self-checks membership and records who/when.
create or replace function public.resolve_report(
  p_report uuid,
  p_status text,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_moderator(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_status not in ('resolved', 'dismissed') then
    raise exception 'invalid status';
  end if;
  update public.user_reports
    set status = p_status,
        resolved_by = auth.uid(),
        resolved_at = now(),
        resolution_note = nullif(btrim(p_note), '')
    where id = p_report and status = 'open';
end;
$$;
revoke all on function public.resolve_report(uuid, text, text) from public, anon;
grant execute on function public.resolve_report(uuid, text, text) to authenticated;
