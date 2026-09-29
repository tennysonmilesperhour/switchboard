-- Boards can outlive the person who started them (G39).
--
-- A board had exactly one moderator for life: the creator. `board_members` has
-- no UPDATE policy — deliberately, since `role` is authority (docs/SECURITY.md
-- §3) — so nobody could ever be promoted, and a moderator who left through the
-- ordinary "remove yourself" delete orphaned the board: no one could invite,
-- rename, remove a post, or rotate its link again.
--
--   - `set_board_member_role` is the one way a role changes. Moderator-only;
--     it refuses to demote the last moderator, and only the founder may step
--     the founder down. Direct writes to `role` are refused by trigger (the
--     freeze_* precedent), lifted only by that function's transaction-local
--     flag (the `rotate_event_share_token` precedent).
--   - The last moderator cannot leave. They hand the board on first, or delete
--     it. That is enforced on the delete itself, so the "remove yourself" path
--     cannot route around it.
--   - An account deletion is the one exit nobody can refuse. If it takes the
--     last moderator, the longest-standing member is promoted, so a board with
--     people in it always has someone who can run it.
--   - A co-moderator cannot remove the founder; the founder decides when to
--     leave. Once the founder has left, any moderator may delete the board
--     (before, deletion was founder-only forever, even after they had gone).

-- ————————————————————————— role changes —————————————————————————

create or replace function private.freeze_board_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.board_id is distinct from old.board_id
     or new.member_id is distinct from old.member_id then
    raise exception 'board membership identity is immutable';
  end if;
  if new.role is distinct from old.role
     and coalesce(current_setting('app.board_role_change', true), '') <> 'on' then
    raise exception 'board roles change only through set_board_member_role()';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_board_membership() from public, anon, authenticated;
grant execute on function private.freeze_board_membership() to service_role;

drop trigger if exists board_members_freeze on public.board_members;
create trigger board_members_freeze
  before update on public.board_members
  for each row execute function private.freeze_board_membership();

-- Outcomes: updated | unchanged | not_member | last_moderator | founder
create or replace function private.set_board_member_role(
  p_board uuid,
  p_member uuid,
  p_role text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_founder uuid;
  v_current text;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  if p_role is null or p_role not in ('member', 'moderator') then
    raise exception 'invalid role';
  end if;
  if not private.is_board_moderator(p_board, v_user) then
    raise exception 'not a moderator of this board';
  end if;

  -- Serialize role changes per board, so two moderators demoting each other at
  -- once cannot both succeed and leave nobody.
  select b.created_by into v_founder
    from public.boards b
   where b.id = p_board
   for update;

  select m.role into v_current
    from public.board_members m
   where m.board_id = p_board and m.member_id = p_member;
  if v_current is null then
    return 'not_member';
  end if;
  if v_current = p_role then
    return 'unchanged';
  end if;

  if p_role = 'member' then
    if p_member = v_founder and v_user <> v_founder then
      return 'founder';
    end if;
    if not exists (
      select 1 from public.board_members m
       where m.board_id = p_board
         and m.role = 'moderator'
         and m.member_id <> p_member
    ) then
      return 'last_moderator';
    end if;
  end if;

  perform set_config('app.board_role_change', 'on', true);
  update public.board_members
     set role = p_role
   where board_id = p_board and member_id = p_member;
  perform set_config('app.board_role_change', 'off', true);
  return 'updated';
end;
$$;

revoke all on function private.set_board_member_role(uuid, uuid, text) from public, anon;
grant execute on function private.set_board_member_role(uuid, uuid, text)
  to authenticated, service_role;

create or replace function public.set_board_member_role(
  p_board uuid,
  p_member uuid,
  p_role text
)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.set_board_member_role(p_board, p_member, p_role);
$$;

revoke all on function public.set_board_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_board_member_role(uuid, uuid, text)
  to authenticated, service_role;

-- ————————————————————————— leaving —————————————————————————

create or replace function private.guard_last_board_moderator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the "remove yourself" path. A board being deleted cascades here with
  -- its row already gone; an account being deleted is handled after the fact.
  if old.role = 'moderator'
     and old.member_id = (select auth.uid())
     and exists (select 1 from public.boards b where b.id = old.board_id)
     and not exists (
       select 1 from public.board_members m
        where m.board_id = old.board_id
          and m.role = 'moderator'
          and m.member_id <> old.member_id
     ) then
    raise exception 'last moderator'
      using hint = 'Make someone else a moderator before you leave, or delete the board.';
  end if;
  return old;
end;
$$;

revoke all on function private.guard_last_board_moderator() from public, anon, authenticated;
grant execute on function private.guard_last_board_moderator() to service_role;

drop trigger if exists board_members_guard_last_moderator on public.board_members;
create trigger board_members_guard_last_moderator
  before delete on public.board_members
  for each row execute function private.guard_last_board_moderator();

create or replace function private.promote_after_moderator_loss()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_heir uuid;
begin
  if old.role <> 'moderator'
     or not exists (select 1 from public.boards b where b.id = old.board_id)
     or exists (
       select 1 from public.board_members m
        where m.board_id = old.board_id and m.role = 'moderator'
     ) then
    return old;
  end if;

  select m.member_id into v_heir
    from public.board_members m
   where m.board_id = old.board_id
   order by m.joined_at asc, m.member_id asc
   limit 1;
  if v_heir is null then
    return old;
  end if;

  perform set_config('app.board_role_change', 'on', true);
  update public.board_members
     set role = 'moderator'
   where board_id = old.board_id and member_id = v_heir;
  perform set_config('app.board_role_change', 'off', true);
  return old;
end;
$$;

revoke all on function private.promote_after_moderator_loss() from public, anon, authenticated;
grant execute on function private.promote_after_moderator_loss() to service_role;

drop trigger if exists board_members_promote_after_loss on public.board_members;
create trigger board_members_promote_after_loss
  after delete on public.board_members
  for each row execute function private.promote_after_moderator_loss();

-- ————————————————————————— policies —————————————————————————

-- You can always remove yourself (the guard above permitting); a moderator can
-- remove anyone but the founder.
alter policy board_members_delete on public.board_members
  using (
    member_id = (select auth.uid())
    or (
      private.is_board_moderator(board_id, (select auth.uid()))
      and not exists (
        select 1 from public.boards b
         where b.id = board_id and b.created_by = member_id
      )
    )
  );

-- The founder may delete their board; once the founder has left it, so may any
-- moderator, or a board would become undeletable the day its founder moved on.
alter policy boards_delete on public.boards
  using (
    created_by = (select auth.uid())
    or (
      private.is_board_moderator(id, (select auth.uid()))
      and not private.is_board_member(id, created_by)
    )
  );
