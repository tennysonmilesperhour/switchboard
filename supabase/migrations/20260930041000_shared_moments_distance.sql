-- Shared moments match on where people are, not on what they typed (P11, D11).
--
-- `find_shared_moments` compared typed place names. Two people at the same
-- café matched only if they spelled it the same way ("Cafe Luna" never met
-- "Café Luna, 5th St"), and two people who both typed "Starbucks" matched
-- across a city. Moments have carried coordinates since
-- 20260714140000_map_coordinates.sql, from the check-in screen's "use my
-- location".
--
-- D11: the zone when checked into one, otherwise within 200 m.
--
--   - Both moments in a zone: they match when it is the same zone, whatever
--     either typed. A zone is the place (and renaming it no longer splits the
--     people already checked in). The private-zone rules are unchanged: the
--     candidate's zone must be one the caller can view, and a zone moment never
--     matches one outside it (20260929160000_private_place_leaks.sql).
--   - Neither in a zone, both located: within 200 m, whatever either typed.
--   - Neither in a zone, either one unlocated: the typed name, as before. There
--     is no distance to compare, and "use my location" is optional.
--
-- Anonymity, blocks, and the return shape are unchanged: an id, experiences,
-- and a headline that is always null before mutual curiosity.
--
-- The distance is measured between points rounded to three decimals (~110 m),
-- the precision `find_nearby_people` already works at. A moment's coordinate is
-- self-writable and this function can be called at will, so an exact boundary
-- test would be a trilateration oracle: move your own check-in, watch an
-- anonymous candidate appear and disappear at 200 m, and a device fix falls out
-- (20260902023519_live_location_coarse_distance.sql is the same lesson). On
-- rounded points the most a caller can learn is which ~110 m cell an anonymous
-- person is in — what being "nearby" means in the first place.

create or replace function private.moment_distance_m(
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
    power(sin(radians(round(lat_b::numeric, 3)::double precision
                      - round(lat_a::numeric, 3)::double precision) / 2), 2)
    + cos(radians(round(lat_a::numeric, 3)::double precision))
      * cos(radians(round(lat_b::numeric, 3)::double precision))
      * power(sin(radians(round(lng_b::numeric, 3)::double precision
                          - round(lng_a::numeric, 3)::double precision) / 2), 2)
  )));
$$;

-- Called only from the definer body below, which runs as its owner. The
-- service role keeps EXECUTE like every other body in private
-- (service_role_grants.test.sql asserts that rule for the schema).
revoke all on function private.moment_distance_m(
  double precision, double precision, double precision, double precision
) from public, anon, authenticated;
grant execute on function private.moment_distance_m(
  double precision, double precision, double precision, double precision
) to service_role;

-- The 200 m below is repeated as MOMENT_MATCH_RADIUS_M in src/lib/geo.ts for
-- the check-in screen's copy; change them together.
create or replace function public.find_shared_moments(p_place text)
returns table (id uuid, experiences text[], headline text)
language sql
stable
security definer
set search_path = public
as $$
  -- `headline` is free text promised only after mutual curiosity. Preserve the
  -- function's established return shape for clients, but never populate that
  -- field on the anonymous discovery surface.
  select m.id, m.experiences, null::text as headline
  from public.moments m
  where m.status = 'open'
    and m.available_until > now()
    and m.user_id <> auth.uid()
    and not public.are_blocked(auth.uid(), m.user_id)
    and (m.zone_id is null or public.can_view_zone(m.zone_id, auth.uid()))
    and exists (
      select 1
      from public.moments mine
      where mine.user_id = auth.uid()
        and lower(mine.place_name) = lower(p_place)
        and mine.status = 'open'
        and mine.available_until > now()
        -- Same zone, or both outside every zone.
        and mine.zone_id is not distinct from m.zone_id
        and (
          -- In a zone: the zone is the place.
          mine.zone_id is not null
          -- Outside zones, both located: about 200 m.
          or (
            mine.latitude is not null and mine.longitude is not null
            and m.latitude is not null and m.longitude is not null
            and private.moment_distance_m(
              mine.latitude, mine.longitude, m.latitude, m.longitude
            ) <= 200
          )
          -- Outside zones, either unlocated: the typed name is all there is.
          or (
            (mine.latitude is null or mine.longitude is null
             or m.latitude is null or m.longitude is null)
            and lower(m.place_name) = lower(mine.place_name)
          )
        )
    );
$$;

revoke all on function public.find_shared_moments(text) from public, anon;
grant execute on function public.find_shared_moments(text) to authenticated;
