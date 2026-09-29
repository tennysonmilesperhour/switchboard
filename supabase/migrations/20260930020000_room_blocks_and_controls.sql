-- Rooms after a block, and the member controls rooms never had (G1, G30).
--
-- ————————————————————————— G1: a block reaches the rooms you share ——————————
--
-- `messages_insert` only asked "is the sender a member?", and nothing reacted
-- to a block, so a blocked person could keep writing into the private room a
-- match or a moment had opened between the two of them, and the person who
-- blocked them kept being notified about it. D12 decides what a block means for
-- a room:
--
--   * A two-person room (`match`, and `moment`, which is the same one-to-one
--     room opened by mutual consent at a place) becomes read-only for BOTH
--     people. Nothing is deleted: either of them can still read what was said,
--     which is also what a report needs. Neither can add to it.
--   * A group room (a plan's Living Room) keeps working for everyone else; the
--     only change is that the blocked pair stop being notified about each
--     other's messages (src/lib/server/notify.ts, notifyRoomActivity).
--
-- The rule is decided in one private helper and enforced on every write path a
-- browser can reach: messages, filed items (insert and update) and, in
-- 20260930022000_split_the_bill.sql, the ledger.
--
-- ————————————————————————— G30: membership controls ———————————————————————
--
--   * `muted` (D20): a muted member is never notified about the room.
--   * `leave_room` (D20): a member may leave a match room, or the room of a plan
--     that has ended. A live plan's room is where its logistics happen, so
--     leaving it while the plan is still on is not offered.
--   * `my_room_inbox`: the inbox read the newest 1000 messages across every
--     room and picked each room's latest from that, so a quiet room behind a
--     busy one showed "No messages yet". This reads one latest message per
--     room, through RLS.
--
-- ————————————————————————— and a hole found on the way ———————————————————————
--
-- `room_members_update` (20260731192027) is `member_id = auth.uid()` on both
-- sides, which pins who the row belongs to but not WHICH ROOM it is in. A
-- member could `update room_members set room_id = '<any room>'` on their own
-- row and walk into a room nobody invited them to, then read everything in it.
-- RLS cannot compare OLD to NEW (docs/SECURITY.md §2), so the identity columns
-- are frozen by trigger, like every other party column in the schema.

-- ————————————————————————— the block rule —————————————————————————
create or replace function private.room_closed_by_block(p_room uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1
    from public.rooms r
    join public.room_members other
      on other.room_id = r.id
     and other.member_id <> p_user
    where r.id = p_room
      and r.kind in ('match', 'moment')
      and private.are_blocked(p_user, other.member_id)
  );
$$;

revoke all on function private.room_closed_by_block(uuid, uuid)
  from public, anon, authenticated;
-- Policies run as the caller, so the policy helper must be executable by the
-- browser role (the same arrangement as private.is_room_member). The private
-- schema is not exposed through PostgREST.
grant execute on function private.room_closed_by_block(uuid, uuid)
  to authenticated, service_role;

-- The page asks whether to show a composer. Caller-bound and members-only, so it
-- answers "is this room closed to me", never a question about two other people.
create or replace function public.room_is_read_only(p_room uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_room_member(p_room, auth.uid())
     and private.room_closed_by_block(p_room, auth.uid());
$$;

revoke all on function public.room_is_read_only(uuid) from public, anon;
grant execute on function public.room_is_read_only(uuid) to authenticated;

alter policy messages_insert on public.messages
  with check (
    sender_id = auth.uid()
    and private.is_room_member(room_id, auth.uid())
    and not private.room_closed_by_block(room_id, auth.uid())
  );

alter policy room_items_write on public.room_items
  with check (
    private.is_room_member(room_id, auth.uid())
    and not private.room_closed_by_block(room_id, auth.uid())
  );

alter policy room_items_update on public.room_items
  using (private.is_room_member(room_id, auth.uid()))
  with check (
    private.is_room_member(room_id, auth.uid())
    and not private.room_closed_by_block(room_id, auth.uid())
  );

-- ————————————————————————— membership identity is frozen —————————————————————
create or replace function private.freeze_room_member_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.room_id is distinct from old.room_id
     or new.member_id is distinct from old.member_id
     or new.joined_at is distinct from old.joined_at then
    raise exception 'room membership cannot be moved to another room or person'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_room_member_identity()
  from public, anon, authenticated;
grant execute on function private.freeze_room_member_identity() to service_role;

drop trigger if exists room_members_freeze_identity on public.room_members;
create trigger room_members_freeze_identity
  before update on public.room_members
  for each row execute function private.freeze_room_member_identity();

-- ————————————————————————— mute —————————————————————————
-- A preference about one's own notifications, not authority over anyone else,
-- so it is safe on the member's own (now identity-frozen) row.
alter table public.room_members
  add column if not exists muted boolean not null default false;

-- ————————————————————————— leave —————————————————————————
create or replace function private.leave_room(p_room uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_kind text;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select r.kind into v_kind from public.rooms r where r.id = p_room;
  if v_kind is null or not private.is_room_member(p_room, v_user) then
    return 'not_member';
  end if;

  if v_kind = 'event' then
    -- Every plan this room belongs to has to be over. A room with no plan left
    -- (deleted) counts as over; one with any live plan does not.
    if exists (
      select 1 from public.events e
      where e.room_id = p_room
        and e.status not in ('past', 'cancelled')
    ) then
      return 'plan_not_over';
    end if;
  elsif v_kind <> 'match' then
    return 'not_allowed';
  end if;

  delete from public.room_members
  where room_id = p_room and member_id = v_user;
  return 'left';
end;
$$;

revoke all on function private.leave_room(uuid) from public, anon, authenticated;
grant execute on function private.leave_room(uuid) to authenticated, service_role;

create or replace function public.leave_room(p_room uuid)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.leave_room(p_room);
$$;

revoke all on function public.leave_room(uuid) from public, anon;
grant execute on function public.leave_room(uuid) to authenticated;

-- ————————————————————————— the inbox —————————————————————————
-- Security invoker: every row comes through the caller's own RLS on
-- room_members, rooms and messages. The lateral read is one index probe per
-- room on messages_room_latest_idx (room_id, created_at desc).
create or replace function public.my_room_inbox()
returns table (
  room_id uuid,
  kind text,
  title text,
  room_created_at timestamptz,
  last_read_at timestamptz,
  muted boolean,
  last_message_body text,
  last_message_at timestamptz,
  last_sender_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.id,
    r.kind,
    r.title,
    r.created_at,
    m.last_read_at,
    m.muted,
    latest.body,
    latest.created_at,
    latest.sender_id
  from public.room_members m
  join public.rooms r on r.id = m.room_id
  left join lateral (
    select msg.body, msg.created_at, msg.sender_id
    from public.messages msg
    where msg.room_id = m.room_id
    order by msg.created_at desc
    limit 1
  ) latest on true
  where m.member_id = auth.uid();
$$;

revoke all on function public.my_room_inbox() from public, anon;
grant execute on function public.my_room_inbox() to authenticated;
