-- Density-gated serendipity and a circle-scoped availability default.
--
-- Home needs to know whether Around is alive in the viewer's city, but it does
-- not need anyone's identity, precise coordinate, or count. The only
-- cross-user value exposed here is therefore one boolean. A viewer's own home
-- point is likewise withheld from the profiles API and available only to that
-- viewer through my_home_point().

alter table public.profiles
  add column home_latitude double precision,
  add column home_longitude double precision,
  add column last_signal_circle_id uuid references public.circles(id) on delete set null,
  add constraint profiles_home_coordinates_check check (
    (home_latitude is null and home_longitude is null)
    or (
      home_latitude is not null
      and home_longitude is not null
      and home_latitude between -90 and 90
      and home_longitude between -180 and 180
      and not (home_latitude = 0 and home_longitude = 0)
    )
  );

-- profiles is self-writable, so a trigger pins this preference to one of the
-- profile owner's circles even when the API is called directly.
create function private.enforce_signal_default_circle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.last_signal_circle_id is not null
     and not exists (
       select 1
       from public.circles c
       where c.id = new.last_signal_circle_id
         and c.owner_id = new.id
     ) then
    raise exception 'signal default must be one of your circles';
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_signal_default_circle
  before insert or update of last_signal_circle_id on public.profiles
  for each row execute function private.enforce_signal_default_circle();

revoke all on function private.enforce_signal_default_circle()
  from public, anon, authenticated;
grant execute on function private.enforce_signal_default_circle() to service_role;

-- The exact point is an owner-only edit aid. It never joins the public profile
-- SELECT allowlist.
create function private.my_home_point()
returns table (latitude double precision, longitude double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select p.home_latitude, p.home_longitude
  from public.profiles p
  where p.id = auth.uid()
    and p.home_latitude is not null
    and p.home_longitude is not null;
$$;

revoke all on function private.my_home_point() from public, anon;
grant execute on function private.my_home_point() to authenticated, service_role;

create function public.my_home_point()
returns table (latitude double precision, longitude double precision)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.my_home_point();
$$;

revoke all on function public.my_home_point() from public, anon;
grant execute on function public.my_home_point() to authenticated, service_role;

-- Around is considered active within a city-sized 50 km radius when the
-- viewer can access an anchored zone or another current live-location share.
-- The result reveals no row, identity, count, or coordinate.
--
-- The comparison is between *coarse cells*, never exact points. The home point
-- is self-writable and this function can be called as often as the caller
-- likes, so an exact haversine against exact live_locations coordinates would
-- be a trilateration oracle: move the home point, watch the boolean flip at the
-- 50 km edge, repeat from three directions, and a sharer's raw fix falls out at
-- better precision than find_nearby_people's ~110 m rounding ever returns
-- (20260902023519_live_location_coarse_distance.sql is the same lesson). Both
-- sides are therefore snapped to a 0.25° grid (~28 km) before the distance is
-- taken, so moving a home point anywhere inside its cell changes nothing and
-- the most a caller can learn is whether some cell of that size, city-wide, has
-- someone visible to them in it — which is what the pillar says out loud.
create function private.coarse_distance_m(
  lat_a double precision,
  lng_a double precision,
  lat_b double precision,
  lng_b double precision
)
returns double precision
language sql
immutable
set search_path = ''
as $$
  select 2 * 6371000 * asin(least(1::double precision, sqrt(
    power(sin(radians(
      round(lat_b / 0.25) * 0.25 - round(lat_a / 0.25) * 0.25) / 2), 2)
    + cos(radians(round(lat_a / 0.25) * 0.25))
      * cos(radians(round(lat_b / 0.25) * 0.25))
      * power(sin(radians(
          round(lng_b / 0.25) * 0.25 - round(lng_a / 0.25) * 0.25) / 2), 2)
  )));
$$;

-- Called only from the definer body below (which runs as the owner), so no
-- browser role needs it. service_role keeps EXECUTE like every other body in
-- private (service_role_grants.test.sql asserts that rule for the schema).
revoke all on function private.coarse_distance_m(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;
grant execute on function private.coarse_distance_m(
  double precision, double precision, double precision, double precision
) to service_role;

create function private.home_around_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      exists (
        select 1
        from public.zones z
        where z.latitude is not null
          and z.longitude is not null
          and public.can_view_zone(z.id, me.id)
          and private.coarse_distance_m(
            me.home_latitude, me.home_longitude, z.latitude, z.longitude
          ) <= 50000
      )
      or exists (
        select 1
        from public.live_locations ll
        where ll.user_id <> me.id
          and ll.expires_at > now()
          and not public.are_blocked(me.id, ll.user_id)
          and (
            ll.visibility = 'sharers'
            or (
              ll.visibility = 'connections'
              and public.are_connected(me.id, ll.user_id)
            )
          )
          and private.coarse_distance_m(
            me.home_latitude, me.home_longitude, ll.latitude, ll.longitude
          ) <= 50000
      )
    from public.profiles me
    where me.id = auth.uid()
      and me.home_latitude is not null
      and me.home_longitude is not null
  ), false);
$$;

revoke all on function private.home_around_available() from public, anon;
grant execute on function private.home_around_available() to authenticated, service_role;

create function public.home_around_available()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.home_around_available();
$$;

revoke all on function public.home_around_available() from public, anon;
grant execute on function public.home_around_available() to authenticated, service_role;

create function private.my_signal_default_circle()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.last_signal_circle_id
  from public.profiles p
  where p.id = auth.uid();
$$;

revoke all on function private.my_signal_default_circle() from public, anon;
grant execute on function private.my_signal_default_circle() to authenticated, service_role;

create function public.my_signal_default_circle()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select private.my_signal_default_circle();
$$;

revoke all on function public.my_signal_default_circle() from public, anon;
grant execute on function public.my_signal_default_circle() to authenticated, service_role;

create function private.set_my_signal_default_circle(p_circle uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  if p_circle is null or not exists (
    select 1
    from public.circles c
    where c.id = p_circle
      and c.owner_id = auth.uid()
  ) then
    raise exception 'signal default must be one of your circles';
  end if;

  update public.profiles
  set last_signal_circle_id = p_circle
  where id = auth.uid();
end;
$$;

revoke all on function private.set_my_signal_default_circle(uuid) from public, anon;
grant execute on function private.set_my_signal_default_circle(uuid)
  to authenticated, service_role;

create function public.set_my_signal_default_circle(p_circle uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.set_my_signal_default_circle(p_circle);
$$;

revoke all on function public.set_my_signal_default_circle(uuid) from public, anon;
grant execute on function public.set_my_signal_default_circle(uuid)
  to authenticated, service_role;
