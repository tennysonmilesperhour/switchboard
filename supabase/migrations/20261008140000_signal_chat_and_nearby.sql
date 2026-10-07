-- A status is an opening: tapping it should start a conversation, and a
-- discoverable friend who is close by should hear about it.
--
-- Two things were missing.
--
--   1. Home's "Around right now" card answered a status with a new-plan form.
--      Nobody wants to fill in a plan to say "I'm free too". Tapping now opens
--      a direct conversation with the person (a `direct` room), with Make a
--      plan one tap away inside it.
--   2. Statuses were passive: friends noticed only when they opened the app.
--      A friend who is discoverable, sharing their location and within a few
--      kilometres of you now gets one notification when you turn a status on.
--
-- Security (docs/SECURITY.md):
--   * The audience rule for a signal lives in the `signals_visible` policy. Two
--     new callers need the same answer for a *different* viewer than the one
--     holding the session (the notifier asks "who would see this?"), so the
--     rule is restated once, in `private.visible_signals_of`, from the same
--     helpers the policy uses. `supabase/tests/signal_chat_and_nearby.test.sql`
--     proves it agrees with the policy row for row; if the two ever drift that
--     test fails.
--   * `open_signal_chat` creates a room between the caller and one other
--     person. It refuses a blocked or suspended person and refuses unless the
--     caller can currently see one of that person's live signals, or the two
--     already share a direct room (so a link to a conversation keeps working
--     after the status that started it has expired). It never reveals anything
--     about the other person's location.
--   * `claim_signal_nearby_recipients` is callable only by the service role. It
--     returns ids only. Both people must be currently sharing a fresh live
--     location, the recipient must be discoverable, and nothing about where
--     either person is leaves the function: not a coordinate, not a distance.
--   * Each (owner, recipient) pair is claimed atomically and at most once per
--     cooldown, so toggling a status on and off cannot be used to ring
--     someone's phone repeatedly.

-- ————————————————————————— direct rooms —————————————————————————
alter table public.rooms drop constraint if exists rooms_kind_check;
alter table public.rooms
  add constraint rooms_kind_check
  check (kind in ('event', 'match', 'group', 'moment', 'direct'));

-- A direct room is a two-person room like a match or a moment, so a block
-- closes it for both people (D12) exactly as it closes those.
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
      and r.kind in ('match', 'moment', 'direct')
      and private.are_blocked(p_user, other.member_id)
  );
$$;

-- Anyone may walk away from a conversation that was only ever the two of them.
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
    if exists (
      select 1 from public.events e
      where e.room_id = p_room
        and e.status not in ('past', 'cancelled')
    ) then
      return 'plan_not_over';
    end if;
  elsif v_kind not in ('match', 'direct') then
    return 'not_allowed';
  end if;

  delete from public.room_members
  where room_id = p_room and member_id = v_user;
  return 'left';
end;
$$;

-- ————————————————————————— who can see a status —————————————————————————
-- The live signals of `p_owner` that `p_viewer` is allowed to see, optionally
-- limited to `p_signal_ids`. Mirrors the `signals_visible` policy and adds the
-- two refusals the policy leaves to other layers (blocked, suspended).
create or replace function private.visible_signals_of(
  p_owner uuid,
  p_viewer uuid,
  p_signal_ids uuid[] default null
)
returns setof public.availability_signals
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.availability_signals s
  where s.user_id = p_owner
    and p_viewer is not null
    and s.user_id <> p_viewer
    and s.expires_at > now()
    and (p_signal_ids is null or s.id = any (p_signal_ids))
    and not private.are_blocked(p_owner, p_viewer)
    and not private.is_suspended(p_owner)
    and (
      (
        private.are_connected(s.user_id, p_viewer)
        and (
          (
            cardinality(s.circle_ids) = 0
            and cardinality(s.person_ids) = 0
            and cardinality(s.board_ids) = 0
          )
          or p_viewer = any (s.person_ids)
          or private.viewer_in_signal_audience(s.user_id, p_viewer, s.circle_ids)
        )
      )
      or private.viewer_in_signal_boards(s.user_id, p_viewer, s.board_ids)
    )
  order by s.expires_at;
$$;

revoke all on function private.visible_signals_of(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function private.visible_signals_of(uuid, uuid, uuid[]) to service_role;

-- ————————————————————————— open a conversation —————————————————————————
create or replace function private.open_signal_chat(p_other uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_room uuid;
  v_title text;
begin
  if v_me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_other is null or p_other = v_me then
    return null;
  end if;
  if private.are_blocked(v_me, p_other) or private.is_suspended(p_other) then
    return null;
  end if;

  -- The thread the pair already has, if either of them still sits in it.
  select r.id into v_room
  from public.rooms r
  where r.kind = 'direct'
    and exists (
      select 1 from public.room_members m
      where m.room_id = r.id and m.member_id = v_me
    )
    and exists (
      select 1 from public.room_members m
      where m.room_id = r.id and m.member_id = p_other
    )
  order by r.created_at
  limit 1;
  if v_room is not null then
    return v_room;
  end if;

  -- A new thread needs a status the caller can actually see. The label of the
  -- soonest-ending one names the room, as a match room is named for its
  -- activity.
  select s.label into v_title
  from private.visible_signals_of(p_other, v_me) s
  limit 1;
  if v_title is null then
    return null;
  end if;

  insert into public.rooms (kind, title, created_by)
  values ('direct', left(v_title, 80), v_me)
  returning id into v_room;
  insert into public.room_members (room_id, member_id)
  values (v_room, v_me), (v_room, p_other);
  return v_room;
end;
$$;

revoke all on function private.open_signal_chat(uuid) from public, anon, authenticated;
grant execute on function private.open_signal_chat(uuid) to authenticated, service_role;

create or replace function public.open_signal_chat(p_other uuid)
returns uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.open_signal_chat(p_other);
$$;

revoke all on function public.open_signal_chat(uuid) from public, anon;
grant execute on function public.open_signal_chat(uuid) to authenticated;

-- ————————————————————————— nearby notices —————————————————————————
-- One row per (owner, recipient): when that recipient was last told the owner
-- was around. Written only by the claim function below.
create table public.signal_nearby_notices (
  owner_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (owner_id, recipient_id)
);

create index signal_nearby_notices_recipient_idx
  on public.signal_nearby_notices (recipient_id);

alter table public.signal_nearby_notices enable row level security;
revoke all on public.signal_nearby_notices from public, anon, authenticated;

-- Who should be told that `p_owner` just turned on `p_signal_ids`, claimed so
-- nobody is told twice within `p_cooldown`.
--
-- A recipient qualifies when every one of these holds:
--   * they are a friend the status is actually offered to (the visibility rule
--     above, which also covers blocks and suspension);
--   * they chose to be discoverable and are not on sabbatical;
--   * both of them are sharing a live location that is still being heard from
--     (written in the last 15 minutes, as find_nearby_people requires);
--   * they are within `p_radius_m` of the owner, measured between points
--     rounded to ~110 m like every other cross-person distance here.
create or replace function private.claim_signal_nearby_recipients(
  p_owner uuid,
  p_signal_ids uuid[],
  p_radius_m double precision default 5000,
  p_cooldown interval default interval '3 hours',
  p_limit integer default 25
)
returns setof uuid
language sql
volatile
security definer
set search_path = ''
as $$
  with me as (
    select
      round(ll.latitude::numeric, 3)::double precision as lat,
      round(ll.longitude::numeric, 3)::double precision as lng
    from public.live_locations ll
    join public.profiles op on op.id = ll.user_id
    where ll.user_id = p_owner
      and ll.expires_at > now()
      and ll.updated_at > now() - interval '15 minutes'
      and not op.sabbatical
      and not private.is_suspended(p_owner)
      and coalesce(cardinality(p_signal_ids), 0) > 0
  ),
  candidates as (
    select
      p.id as recipient,
      (
        2 * 6371000 * asin(least(1::double precision, sqrt(
          power(sin(radians(round(ll.latitude::numeric, 3)::double precision - me.lat) / 2), 2)
          + cos(radians(me.lat)) * cos(radians(round(ll.latitude::numeric, 3)::double precision))
            * power(sin(radians(round(ll.longitude::numeric, 3)::double precision - me.lng) / 2), 2)
        )))
      )::double precision as distance_m
    from me
    cross join public.live_locations ll
    join public.profiles p on p.id = ll.user_id
    where ll.user_id <> p_owner
      and ll.expires_at > now()
      and ll.updated_at > now() - interval '15 minutes'
      and p.discoverable
      and not p.sabbatical
      and not private.is_suspended(p.id)
      and not private.are_blocked(p_owner, p.id)
      and exists (select 1 from private.visible_signals_of(p_owner, p.id, p_signal_ids))
  ),
  nearby as (
    select recipient
    from candidates
    where distance_m <= greatest(0, coalesce(p_radius_m, 5000))
    order by distance_m
    limit greatest(0, least(coalesce(p_limit, 25), 50))
  ),
  claimed as (
    insert into public.signal_nearby_notices as n (owner_id, recipient_id, notified_at)
    select p_owner, recipient, now() from nearby
    on conflict (owner_id, recipient_id) do update
      set notified_at = now()
      where n.notified_at < now() - p_cooldown
    returning n.recipient_id
  )
  select claimed.recipient_id from claimed;
$$;

revoke all on function private.claim_signal_nearby_recipients(uuid, uuid[], double precision, interval, integer)
  from public, anon, authenticated;
grant execute on function private.claim_signal_nearby_recipients(uuid, uuid[], double precision, interval, integer)
  to service_role;

-- PostgREST exposes only `public`, so the service role reaches it through a
-- thin invoker wrapper that no one else can execute.
create or replace function public.claim_signal_nearby_recipients(
  p_owner uuid,
  p_signal_ids uuid[],
  p_radius_m double precision default 5000,
  p_cooldown interval default interval '3 hours',
  p_limit integer default 25
)
returns setof uuid
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.claim_signal_nearby_recipients(p_owner, p_signal_ids, p_radius_m, p_cooldown, p_limit);
$$;

revoke all on function public.claim_signal_nearby_recipients(uuid, uuid[], double precision, interval, integer)
  from public, anon, authenticated;
grant execute on function public.claim_signal_nearby_recipients(uuid, uuid[], double precision, interval, integer)
  to service_role;
