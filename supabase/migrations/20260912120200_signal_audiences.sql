-- Availability signals: an audience per signal, made of circles, specific
-- people, and groups.
--
-- Client feedback, three parts:
--   1. "Pick specific people for any particular availability signal."
--   2. "Share a group … send a live availability signal to a whole group."
--   3. "Not activated until I finalize it." (composer behaviour; the app
--      inserts nothing until the person taps Turn on — no schema needed.)
--
-- Each signal row already carries its own `circle_ids`; the app used to write
-- one audience across every live row, which is what made them look shared.
-- Two more arrays join it:
--
--   * `person_ids` — connections named one by one. Visible to a viewer who is
--     one of them AND still connected to the owner (an unfriended person drops
--     out even if their id lingers in the array).
--   * `board_ids`  — groups (boards) the owner belongs to. Visible to any
--     other member of one of those boards, connected or not: a board is an
--     invite-only room whose membership was already consented to on both
--     sides. Blocks still win. The owner must be a member of the board at
--     read time, so leaving a group ends the signal's reach into it.
--
-- Security (docs/SECURITY.md §3): all three arrays are the owner's own
-- audience choice on a row only they can write (`signals_own`). None grants
-- authority; the helpers check membership from the *viewer's* side and
-- refuse a board the owner is not in, so a row cannot be pointed at a
-- stranger's group. An audience with all three empty keeps the old meaning:
-- everyone the owner is connected to.

alter table public.availability_signals
  add column if not exists person_ids uuid[] not null default '{}',
  add column if not exists board_ids uuid[] not null default '{}';

-- Bound the arrays: an audience is a short list, not a bulk store.
alter table public.availability_signals
  drop constraint if exists availability_signals_audience_size;
alter table public.availability_signals
  add constraint availability_signals_audience_size
  check (
    cardinality(circle_ids) <= 100
    and cardinality(person_ids) <= 200
    and cardinality(board_ids) <= 50
  );

-- board_members is member-readable under RLS, so as with circles the check
-- has to be a definer helper; it answers one boolean and nothing else.
create or replace function private.viewer_in_signal_boards(
  p_owner uuid,
  p_viewer uuid,
  p_board_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_owner is not null
    and p_viewer is not null
    and cardinality(p_board_ids) > 0
    and not private.are_blocked(p_owner, p_viewer)
    and exists (
      select 1
      from public.board_members owner_m
      join public.board_members viewer_m on viewer_m.board_id = owner_m.board_id
      where owner_m.board_id = any (p_board_ids)
        and owner_m.member_id = p_owner
        and viewer_m.member_id = p_viewer
    );
$$;

revoke all on function private.viewer_in_signal_boards(uuid, uuid, uuid[])
  from public, anon;
grant execute on function private.viewer_in_signal_boards(uuid, uuid, uuid[])
  to authenticated, service_role;

drop policy if exists signals_visible on public.availability_signals;
create policy signals_visible on public.availability_signals for select to authenticated
  using (
    user_id <> (select auth.uid())
    and expires_at > now()
    and (
      (
        private.are_connected(user_id, (select auth.uid()))
        and (
          (
            cardinality(circle_ids) = 0
            and cardinality(person_ids) = 0
            and cardinality(board_ids) = 0
          )
          or (select auth.uid()) = any (person_ids)
          or private.viewer_in_signal_audience(user_id, (select auth.uid()), circle_ids)
        )
      )
      or private.viewer_in_signal_boards(user_id, (select auth.uid()), board_ids)
    )
  );
