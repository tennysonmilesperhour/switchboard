-- Shareable board invite links.
--
-- Until now a board moderator could only add neighbors by exact handle
-- (`inviteToBoard`), which doesn't work for someone not yet reachable by
-- handle. This adds an opt-in shareable code: the moderator mints one link,
-- and anyone who opens it while signed in joins as a member.
--
-- Security posture (see docs/SECURITY.md): the code is the capability. Minting
-- is moderator-only; redeeming is available to any authenticated user who holds
-- a valid code. Both run in SECURITY DEFINER functions that re-check the caller
-- and resource, so the base RLS (which only lets moderators insert members) is
-- never widened. `role` is always forced to 'member' on redeem — a link can
-- never grant moderator.

alter table public.boards
  add column if not exists invite_code text unique;

-- Mint (or return the existing) invite code for a board. Moderator-only.
create or replace function public.ensure_board_invite_code(p_board uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_board_moderator(p_board, auth.uid()) then
    raise exception 'not a moderator of this board';
  end if;

  select invite_code into v_code from public.boards where id = p_board;
  if v_code is null then
    v_code := replace(gen_random_uuid()::text, '-', '');
    update public.boards set invite_code = v_code where id = p_board;
  end if;
  return v_code;
end $$;

-- Rotate the code, invalidating any previously shared link. Moderator-only.
create or replace function public.rotate_board_invite_code(p_board uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_board_moderator(p_board, auth.uid()) then
    raise exception 'not a moderator of this board';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '');
  update public.boards set invite_code = v_code where id = p_board;
  return v_code;
end $$;

-- Redeem a code: add the caller to the board as a plain member and return the
-- board slug so the client can route there. Returns null for an unknown code.
-- Idempotent — re-redeeming when already a member is a no-op that still returns
-- the slug.
create or replace function public.join_board_via_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_board_id uuid;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_code is null or char_length(btrim(p_code)) = 0 then return null; end if;

  select id, slug into v_board_id, v_slug
    from public.boards where invite_code = p_code;
  if v_board_id is null then return null; end if;

  insert into public.board_members (board_id, member_id, role)
    values (v_board_id, auth.uid(), 'member')
    on conflict (board_id, member_id) do nothing;

  return v_slug;
end $$;

grant execute on function public.ensure_board_invite_code(uuid) to authenticated;
grant execute on function public.rotate_board_invite_code(uuid) to authenticated;
grant execute on function public.join_board_via_code(text) to authenticated;
