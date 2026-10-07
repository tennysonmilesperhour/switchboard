-- Explore, split into Plans and People, each filtered by range.
--
-- Plans: until now the only plans Explore could show were Open Tables from
-- friends of friends. A host can now also broadcast a plan to people nearby,
-- strangers included. It is opt-in per plan (`events.broadcast_nearby`), only
-- ever applies to an Open Table (the host still approves every request), and
-- is matched on coarse distance between the host's and the viewer's home
-- points. No plan coordinates or venue are exposed: a stranger sees the title,
-- the day, the host's first-visible name, seats left, and a distance band.
--
-- People: `list_discoverable_people` already knows who is within 50 km, but
-- only as a yes/no category. `list_people_distance_bands` returns the band so
-- the page can narrow a range (the same rules: both sides opted into
-- geography, both have a home point, neither blocked, suspended, or on
-- sabbatical, and the caller is themselves discoverable).
--
-- Distance is `private.coarse_distance_m`, which snaps both points to a 0.25
-- degree grid (about 28 km). The bands are therefore:
--   area    the same grid cell (distance 0)
--   nearby  within 50 km
--   wider   within 100 km
-- Nothing finer is available by design (see 20260902123000).

alter table public.events
  add column if not exists broadcast_nearby boolean not null default false;

alter table public.events
  drop constraint if exists events_broadcast_needs_open_table;
alter table public.events
  add constraint events_broadcast_needs_open_table
  check (not broadcast_nearby or open_table);

-- Broadcasting a plan is a host power. `events_update` already limits who may
-- write the row to hosts and co-hosts, and ownership columns are frozen.

create or replace function private.list_nearby_plans(p_max_km integer default 50)
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  time_zone text,
  host_name text,
  spots_left integer,
  known_via text,
  distance_band text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, home_latitude, home_longitude
    from public.profiles
    where id = auth.uid()
      and home_latitude is not null
      and home_longitude is not null
      and not coalesce(sabbatical, false)
      and not private.is_suspended(id)
  ),
  candidate as (
    select
      e.id,
      e.title,
      e.starts_at,
      e.time_zone,
      e.host_id,
      p.display_name as host_name,
      coalesce(e.capacity, 0) - (
        select count(*) from public.invites i
        where i.event_id = e.id and i.status = 'accepted'
      ) as spots_left,
      private.coarse_distance_m(
        me.home_latitude, me.home_longitude,
        p.home_latitude, p.home_longitude
      ) as distance_m
    from public.events e
    join public.profiles p on p.id = e.host_id
    cross join me
    where e.broadcast_nearby
      and e.open_table
      and e.status in ('inviting', 'confirmed')
      and e.capacity is not null
      and (e.starts_at is null or e.starts_at > now())
      and e.host_id <> auth.uid()
      and p.home_latitude is not null
      and p.home_longitude is not null
      and not coalesce(p.sabbatical, false)
      and not public.are_blocked(auth.uid(), e.host_id)
      and not private.is_suspended(e.host_id)
      and not exists (
        select 1 from public.invites i
        where i.event_id = e.id and i.invitee_id = auth.uid()
      )
  )
  select
    c.id,
    c.title,
    c.starts_at,
    c.time_zone,
    c.host_name,
    c.spots_left::integer,
    case
      when public.are_connected(auth.uid(), c.host_id) then c.host_name
      else (
        select pr.display_name
        from public.invites i
        join public.profiles pr on pr.id = i.invitee_id
        where i.event_id = c.id
          and i.status = 'accepted'
          and public.are_connected(auth.uid(), i.invitee_id)
        limit 1
      )
    end as known_via,
    case
      when c.distance_m = 0 then 'area'
      when c.distance_m <= 50000 then 'nearby'
      else 'wider'
    end as distance_band
  from candidate c
  where c.spots_left > 0
    and c.distance_m <= least(greatest(coalesce(p_max_km, 50), 1), 100) * 1000.0
  order by c.distance_m asc, c.starts_at asc nulls last
  limit 60;
$$;

revoke all on function private.list_nearby_plans(integer) from public, anon;
grant execute on function private.list_nearby_plans(integer)
  to authenticated, service_role;

create or replace function public.list_nearby_plans(p_max_km integer default 50)
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  time_zone text,
  host_name text,
  spots_left integer,
  known_via text,
  distance_band text
)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_nearby_plans(p_max_km) $$;

revoke all on function public.list_nearby_plans(integer) from public, anon;
grant execute on function public.list_nearby_plans(integer) to authenticated;

create or replace function private.list_people_distance_bands()
returns table (person_id uuid, distance_band text)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, home_latitude, home_longitude
    from public.profiles
    where id = auth.uid()
      and discoverable
      and discovery_geography
      and home_latitude is not null
      and home_longitude is not null
      and not coalesce(sabbatical, false)
  ),
  banded as (
    select
      p.id,
      private.coarse_distance_m(
        me.home_latitude, me.home_longitude,
        p.home_latitude, p.home_longitude
      ) as distance_m
    from public.profiles p
    cross join me
    where p.discoverable
      and p.discovery_geography
      and p.id <> auth.uid()
      and p.home_latitude is not null
      and p.home_longitude is not null
      and not coalesce(p.sabbatical, false)
      and not public.are_blocked(auth.uid(), p.id)
      and not private.is_suspended(p.id)
  )
  select
    b.id,
    case
      when b.distance_m = 0 then 'area'
      when b.distance_m <= 50000 then 'nearby'
      else 'wider'
    end
  from banded b
  where b.distance_m <= 100000
  limit 400;
$$;

revoke all on function private.list_people_distance_bands() from public, anon;
grant execute on function private.list_people_distance_bands()
  to authenticated, service_role;

create or replace function public.list_people_distance_bands()
returns table (person_id uuid, distance_band text)
language sql
stable
security invoker
set search_path = ''
as $$ select * from private.list_people_distance_bands() $$;

revoke all on function public.list_people_distance_bands() from public, anon;
grant execute on function public.list_people_distance_bands() to authenticated;

-- A request to join a stranger's plan must respect blocks and suspensions the
-- way every other reach-out does. `request_to_join` checked only that the plan
-- was an Open Table, which was safe while Open Tables were reachable only
-- through friends of friends; broadcast plans widen who can see one, so the
-- door gets the same checks as the list.
create or replace function private.request_to_join(p_event uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_id uuid;
  v_pos int;
begin
  select * into v_event from public.events where id = p_event for update;
  if not found or not v_event.open_table then
    raise exception 'event is not open';
  end if;
  if public.are_blocked(auth.uid(), v_event.host_id)
     or private.is_suspended(v_event.host_id)
     or private.is_suspended(auth.uid()) then
    raise exception 'event is not open';
  end if;
  if exists (select 1 from public.invites where event_id = p_event and invitee_id = auth.uid()) then
    raise exception 'already involved';
  end if;
  select coalesce(max(position), -1) + 1 into v_pos from public.invites where event_id = p_event;
  insert into public.invites (event_id, invitee_id, position, group_stage, window_minutes, status)
    values (p_event, auth.uid(), v_pos, 999, 1440, 'requested')
    returning id into v_id;
  return v_id;
end $$;

revoke all on function private.request_to_join(uuid) from public, anon;
grant execute on function private.request_to_join(uuid)
  to authenticated, service_role;
