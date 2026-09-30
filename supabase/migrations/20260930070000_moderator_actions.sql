-- Moderators can act, and reports carry what was reported (P7, decision D7).
--
-- "Mark actioned" only ever recorded a status: nothing in the app could suspend
-- an account, take down a board post or take down a room message, and a report
-- about a room message named only its sender. This adds the three actions and
-- the evidence a moderator needs to take them.
--
--   1. Suspension is GoTrue's own ban (`auth.users.banned_until`). Sign-in
--      already names it (`user_banned` -> SB-AUTH-SUSPENDED, docs/AUTH.md
--      finding 4), the auth server refuses the password, refresh and link
--      grants for it, and nobody can write `auth.users` from the API. There is
--      one copy of the state, so the sign-in form, the proxy and the database
--      rules below cannot disagree about who is suspended.
--      `private.is_suspended` reads it for the write policies that close the
--      rest of an already-issued access token's lifetime.
--   2. A removal is soft: `removed_at` on the post or message. Members stop
--      seeing it (the SELECT policies), nobody can edit or delete it, and the
--      report still shows what was said. Only the moderator functions, through
--      a transaction-local flag, can set it (the set_board_member_role
--      precedent); a trigger refuses every other write to the column.
--   3. Every action lands in `moderation_actions`: who, what, when, and which
--      report. Nobody can write that table from the API; moderators can read it.
--   4. A room-message report attaches the message. `user_reports.message_id`
--      names it and a trigger copies its body and photo path from the row
--      itself, never from the reporter, so the report still shows what was
--      said after the sender deletes it (hence ON DELETE SET NULL). A board
--      post report now keeps the post's title and body as they were when it
--      was flagged, so a later edit cannot rewrite the evidence.
--
-- Moderator functions follow 20260717192758: SECURITY DEFINER bodies in
-- `private` with an empty search_path, behind SECURITY INVOKER wrappers in
-- `public`. Each one re-checks `private.is_platform_moderator(auth.uid())`,
-- and each suspension or removal must name the open report it answers.

-- ————————————————————————— suspension state —————————————————————————

create or replace function private.is_suspended(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from auth.users u
     where u.id = p_user
       and u.banned_until is not null
       and u.banned_until > now()
  );
$$;

revoke all on function private.is_suspended(uuid) from public, anon;
grant execute on function private.is_suspended(uuid) to authenticated, service_role;

-- ————————————————————————— the audit trail —————————————————————————

create table if not exists public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid references public.profiles(id) on delete set null,
  action text not null
    check (action in ('suspend', 'lift_suspension', 'remove_post', 'remove_message')),
  subject_id uuid references public.profiles(id) on delete set null,
  report_id uuid references public.user_reports(id) on delete set null,
  post_id uuid references public.board_posts(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  suspended_until timestamptz,
  note text check (note is null or char_length(note) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists moderation_actions_moderator_id_fkey_idx
  on public.moderation_actions (moderator_id);
create index if not exists moderation_actions_subject_id_fkey_idx
  on public.moderation_actions (subject_id, created_at desc);
create index if not exists moderation_actions_report_id_fkey_idx
  on public.moderation_actions (report_id);
create index if not exists moderation_actions_post_id_fkey_idx
  on public.moderation_actions (post_id);
create index if not exists moderation_actions_message_id_fkey_idx
  on public.moderation_actions (message_id);

alter table public.moderation_actions enable row level security;

-- Moderators may read the trail; nobody may write it from the API. The only
-- writers are the definer functions below.
drop policy if exists moderation_actions_moderator_select on public.moderation_actions;
create policy moderation_actions_moderator_select on public.moderation_actions
  for select to authenticated
  using (private.is_platform_moderator((select auth.uid())));

revoke insert, update, delete, truncate on public.moderation_actions from anon, authenticated;

-- ————————————————————————— soft removal —————————————————————————

alter table public.messages add column if not exists removed_at timestamptz;
alter table public.board_posts add column if not exists removed_at timestamptz;

create or replace function private.guard_moderation_removal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.moderation_removal', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.removed_at is not null then
      raise exception 'only a moderator can remove a post or message'
        using errcode = '42501';
    end if;
  elsif new.removed_at is distinct from old.removed_at then
    raise exception 'only a moderator can remove a post or message'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_moderation_removal() from public, anon, authenticated;
grant execute on function private.guard_moderation_removal() to service_role;

drop trigger if exists messages_guard_moderation_removal on public.messages;
create trigger messages_guard_moderation_removal
  before insert or update of removed_at on public.messages
  for each row execute function private.guard_moderation_removal();

drop trigger if exists board_posts_guard_moderation_removal on public.board_posts;
create trigger board_posts_guard_moderation_removal
  before insert or update of removed_at on public.board_posts
  for each row execute function private.guard_moderation_removal();

-- Removed content is invisible to members (the moderator reads it through
-- list_open_reports). A DELETE or UPDATE with a WHERE clause also applies the
-- SELECT policy, so a removed post or message can no longer be edited or
-- deleted by its author either: it is the record of what was removed.
alter policy messages_select on public.messages
  using (
    private.is_room_member(room_id, (select auth.uid()))
    and removed_at is null
  );

alter policy board_posts_select on public.board_posts
  using (
    private.is_board_member(board_id, (select auth.uid()))
    and removed_at is null
  );

-- A suspended account cannot add what a moderator can remove, for whatever is
-- left of an access token issued before the suspension.
alter policy messages_insert on public.messages
  with check (
    sender_id = (select auth.uid())
    and private.is_room_member(room_id, (select auth.uid()))
    and not private.room_closed_by_block(room_id, (select auth.uid()))
    and not private.is_suspended((select auth.uid()))
  );

alter policy board_posts_insert on public.board_posts
  with check (
    author_id = (select auth.uid())
    and private.is_board_member(board_id, (select auth.uid()))
    and not private.is_suspended((select auth.uid()))
  );

alter policy board_posts_update on public.board_posts
  using (
    author_id = (select auth.uid())
    and private.is_board_member(board_id, (select auth.uid()))
    and removed_at is null
  )
  with check (
    author_id = (select auth.uid())
    and private.is_board_member(board_id, (select auth.uid()))
    and not private.is_suspended((select auth.uid()))
  );

-- ————————————————————————— reports attach what was reported —————————————————————————

alter table public.user_reports
  add column if not exists message_id uuid references public.messages(id) on delete set null,
  add column if not exists snapshot_title text,
  add column if not exists snapshot_body text,
  add column if not exists snapshot_image text;

create index if not exists user_reports_message_id_fkey_idx
  on public.user_reports (message_id);

-- One report per person per message, as for posts.
create unique index if not exists user_reports_one_per_message_idx
  on public.user_reports (reporter_id, message_id)
  where target_kind = 'room_message';

alter table public.user_reports drop constraint if exists user_reports_target_kind_check;
alter table public.user_reports
  add constraint user_reports_target_kind_check
  check (target_kind in ('profile', 'board_post', 'room_message'));

-- A message report keeps its snapshot after the message is deleted, so it is
-- the snapshot, not the id, that must always be there.
alter table public.user_reports drop constraint if exists user_reports_target_matches_kind;
alter table public.user_reports
  add constraint user_reports_target_matches_kind check (
    (target_kind = 'profile' and target_id is null and message_id is null)
    or (target_kind = 'board_post' and target_id is not null and message_id is null)
    or (target_kind = 'room_message' and target_id is null and snapshot_body is not null)
  );

create or replace function private.capture_report_target()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_room uuid;
  v_sender uuid;
  v_body text;
  v_image text;
  v_removed timestamptz;
  v_board uuid;
  v_author uuid;
  v_title text;
begin
  -- Whatever the reporter sent, the snapshot is what the database holds.
  new.snapshot_title := null;
  new.snapshot_body := null;
  new.snapshot_image := null;

  if new.target_kind = 'room_message' then
    if new.message_id is null then
      raise exception 'a message report must name the message' using errcode = '23514';
    end if;
    select m.room_id, m.sender_id, m.body, m.image_url, m.removed_at
      into v_room, v_sender, v_body, v_image, v_removed
      from public.messages m
     where m.id = new.message_id;
    -- Only a message the reporter can read: a copy made here is readable by
    -- the reporter through user_reports_own_select.
    if v_room is null
       or v_removed is not null
       or (v_caller is not null and not private.is_room_member(v_room, v_caller)) then
      raise exception 'message not found' using errcode = 'P0002';
    end if;
    new.reported_id := v_sender;
    new.snapshot_body := v_body;
    new.snapshot_image := v_image;
  elsif new.target_kind = 'board_post' then
    select p.board_id, p.author_id, p.title, p.body, p.removed_at
      into v_board, v_author, v_title, v_body, v_removed
      from public.board_posts p
     where p.id = new.target_id;
    if v_board is not null then
      if v_removed is not null
         or (v_caller is not null and not private.is_board_member(v_board, v_caller)) then
        raise exception 'post not found' using errcode = 'P0002';
      end if;
      new.reported_id := v_author;
      new.snapshot_title := v_title;
      new.snapshot_body := v_body;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_report_target() from public, anon, authenticated;
grant execute on function private.capture_report_target() to service_role;

drop trigger if exists user_reports_capture_target on public.user_reports;
create trigger user_reports_capture_target
  before insert on public.user_reports
  for each row execute function private.capture_report_target();

-- ————————————————————————— the queue —————————————————————————

-- The 20260818 redefinition left the queue's body in `public` as a definer and
-- a stale copy in `private`; both go, replaced by the usual pair.
drop function if exists public.list_open_reports();
drop function if exists private.list_open_reports();

create function private.list_open_reports()
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
  target_body text,
  target_image text,
  target_exists boolean,
  target_removed_at timestamptz,
  room_title text,
  reported_suspended_until timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.reason, r.created_at,
         r.reporter_id, rp.display_name,
         r.reported_id, tp.display_name, tp.handle,
         r.target_kind,
         coalesce(r.target_id, r.message_id),
         coalesce(r.snapshot_title, bp.title),
         coalesce(r.snapshot_body, bp.body),
         r.snapshot_image,
         (bp.id is not null or m.id is not null),
         coalesce(bp.removed_at, m.removed_at),
         room.title,
         case when u.banned_until > now() then u.banned_until end
    from public.user_reports r
    join public.profiles rp on rp.id = r.reporter_id
    join public.profiles tp on tp.id = r.reported_id
    left join public.board_posts bp on bp.id = r.target_id
    left join public.messages m on m.id = r.message_id
    left join public.rooms room on room.id = m.room_id
    left join auth.users u on u.id = r.reported_id
   where r.status = 'open'
     and private.is_platform_moderator((select auth.uid()))
   order by r.created_at asc;
$$;

revoke all on function private.list_open_reports() from public, anon;
grant execute on function private.list_open_reports() to authenticated, service_role;

create function public.list_open_reports()
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
  target_body text,
  target_image text,
  target_exists boolean,
  target_removed_at timestamptz,
  room_title text,
  reported_suspended_until timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_open_reports();
$$;

revoke all on function public.list_open_reports() from public, anon;
grant execute on function public.list_open_reports() to authenticated, service_role;

-- Everyone suspended right now, including anyone banned outside the app, with
-- the latest in-app suspension's note. Empty for anyone but a moderator.
create or replace function private.list_suspended_accounts()
returns table (
  member_id uuid,
  display_name text,
  handle text,
  suspended_until timestamptz,
  suspended_at timestamptz,
  note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.handle, u.banned_until, latest.created_at, latest.note
    from auth.users u
    join public.profiles p on p.id = u.id
    left join lateral (
      select a.created_at, a.note
        from public.moderation_actions a
       where a.subject_id = u.id and a.action = 'suspend'
       order by a.created_at desc
       limit 1
    ) latest on true
   where u.banned_until > now()
     and private.is_platform_moderator((select auth.uid()))
   order by latest.created_at desc nulls last, p.display_name;
$$;

revoke all on function private.list_suspended_accounts() from public, anon;
grant execute on function private.list_suspended_accounts() to authenticated, service_role;

create or replace function public.list_suspended_accounts()
returns table (
  member_id uuid,
  display_name text,
  handle text,
  suspended_until timestamptz,
  suspended_at timestamptz,
  note text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.list_suspended_accounts();
$$;

revoke all on function public.list_suspended_accounts() from public, anon;
grant execute on function public.list_suspended_accounts() to authenticated, service_role;

-- ————————————————————————— suspending —————————————————————————

-- Outcomes: suspended | self | moderator | not_found
create or replace function private.moderate_suspend_account(
  p_member uuid,
  p_report uuid,
  p_days integer default null,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_until timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if not private.is_platform_moderator(v_user) then
    raise exception 'not authorized';
  end if;
  if p_days is not null and (p_days < 1 or p_days > 365) then
    raise exception 'invalid duration';
  end if;
  if not exists (
    select 1 from public.user_reports r
     where r.id = p_report and r.reported_id = p_member and r.status = 'open'
  ) then
    raise exception 'no open report about this account';
  end if;
  if p_member = v_user then
    return 'self';
  end if;
  -- Moderator authority is granted by the operator, and so is taken away by
  -- the operator; one moderator cannot lock another out.
  if private.is_platform_moderator(p_member) then
    return 'moderator';
  end if;

  -- GoTrue has no "forever", so an open-ended suspension is a century.
  v_until := case
    when p_days is null then now() + interval '100 years'
    else now() + make_interval(days => p_days)
  end;

  update auth.users
     set banned_until = v_until,
         updated_at = now()
   where id = p_member;
  if not found then
    return 'not_found';
  end if;

  insert into public.moderation_actions
    (moderator_id, action, subject_id, report_id, suspended_until, note)
  values
    (v_user, 'suspend', p_member, p_report, v_until, v_note);
  return 'suspended';
end;
$$;

revoke all on function private.moderate_suspend_account(uuid, uuid, integer, text) from public, anon;
grant execute on function private.moderate_suspend_account(uuid, uuid, integer, text)
  to authenticated, service_role;

create or replace function public.moderate_suspend_account(
  p_member uuid,
  p_report uuid,
  p_days integer default null,
  p_note text default null
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.moderate_suspend_account(p_member, p_report, p_days, p_note);
$$;

revoke all on function public.moderate_suspend_account(uuid, uuid, integer, text) from public, anon;
grant execute on function public.moderate_suspend_account(uuid, uuid, integer, text)
  to authenticated, service_role;

-- Outcomes: lifted | not_suspended
create or replace function private.moderate_lift_suspension(
  p_member uuid,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if not private.is_platform_moderator(v_user) then
    raise exception 'not authorized';
  end if;

  update auth.users
     set banned_until = null,
         updated_at = now()
   where id = p_member
     and banned_until > now();
  if not found then
    return 'not_suspended';
  end if;

  insert into public.moderation_actions (moderator_id, action, subject_id, note)
  values (v_user, 'lift_suspension', p_member, v_note);
  return 'lifted';
end;
$$;

revoke all on function private.moderate_lift_suspension(uuid, text) from public, anon;
grant execute on function private.moderate_lift_suspension(uuid, text)
  to authenticated, service_role;

create or replace function public.moderate_lift_suspension(
  p_member uuid,
  p_note text default null
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.moderate_lift_suspension(p_member, p_note);
$$;

revoke all on function public.moderate_lift_suspension(uuid, text) from public, anon;
grant execute on function public.moderate_lift_suspension(uuid, text)
  to authenticated, service_role;

-- ————————————————————————— removing —————————————————————————

-- Outcomes: removed | already_removed | not_found
create or replace function private.moderate_remove_board_post(
  p_post uuid,
  p_report uuid,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_author uuid;
  v_removed timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if not private.is_platform_moderator(v_user) then
    raise exception 'not authorized';
  end if;

  select p.author_id, p.removed_at
    into v_author, v_removed
    from public.board_posts p
   where p.id = p_post
   for update;
  if v_author is null then
    return 'not_found';
  end if;
  if not exists (
    select 1 from public.user_reports r
     where r.id = p_report
       and r.target_kind = 'board_post'
       and r.target_id = p_post
       and r.status = 'open'
  ) then
    raise exception 'no open report about this post';
  end if;
  if v_removed is not null then
    return 'already_removed';
  end if;

  perform set_config('app.moderation_removal', 'on', true);
  update public.board_posts set removed_at = now() where id = p_post;
  perform set_config('app.moderation_removal', 'off', true);

  insert into public.moderation_actions
    (moderator_id, action, subject_id, report_id, post_id, note)
  values
    (v_user, 'remove_post', v_author, p_report, p_post, v_note);
  return 'removed';
end;
$$;

revoke all on function private.moderate_remove_board_post(uuid, uuid, text) from public, anon;
grant execute on function private.moderate_remove_board_post(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.moderate_remove_board_post(
  p_post uuid,
  p_report uuid,
  p_note text default null
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.moderate_remove_board_post(p_post, p_report, p_note);
$$;

revoke all on function public.moderate_remove_board_post(uuid, uuid, text) from public, anon;
grant execute on function public.moderate_remove_board_post(uuid, uuid, text)
  to authenticated, service_role;

-- Outcomes: removed | already_removed | not_found
create or replace function private.moderate_remove_room_message(
  p_message uuid,
  p_report uuid,
  p_note text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_note text := left(nullif(btrim(coalesce(p_note, '')), ''), 500);
  v_room uuid;
  v_sender uuid;
  v_image text;
  v_removed timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if not private.is_platform_moderator(v_user) then
    raise exception 'not authorized';
  end if;

  select m.room_id, m.sender_id, m.image_url, m.removed_at
    into v_room, v_sender, v_image, v_removed
    from public.messages m
   where m.id = p_message
   for update;
  if v_room is null then
    return 'not_found';
  end if;
  if not exists (
    select 1 from public.user_reports r
     where r.id = p_report
       and r.target_kind = 'room_message'
       and r.message_id = p_message
       and r.status = 'open'
  ) then
    raise exception 'no open report about this message';
  end if;
  if v_removed is not null then
    return 'already_removed';
  end if;

  perform set_config('app.moderation_removal', 'on', true);
  update public.messages set removed_at = now() where id = p_message;
  perform set_config('app.moderation_removal', 'off', true);

  -- What the message filed into the room's tabs came from it, and goes with
  -- it: a removed photo must not stay up in the Photos tab. The stored photo
  -- itself stays, because the report shows it to the moderator.
  delete from public.room_items i
   where i.message_id = p_message
      or (v_image is not null
          and i.room_id = v_room
          and i.kind = 'photo'
          and i.url = v_image);

  insert into public.moderation_actions
    (moderator_id, action, subject_id, report_id, message_id, note)
  values
    (v_user, 'remove_message', v_sender, p_report, p_message, v_note);
  return 'removed';
end;
$$;

revoke all on function private.moderate_remove_room_message(uuid, uuid, text) from public, anon;
grant execute on function private.moderate_remove_room_message(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.moderate_remove_room_message(
  p_message uuid,
  p_report uuid,
  p_note text default null
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.moderate_remove_room_message(p_message, p_report, p_note);
$$;

revoke all on function public.moderate_remove_room_message(uuid, uuid, text) from public, anon;
grant execute on function public.moderate_remove_room_message(uuid, uuid, text)
  to authenticated, service_role;
