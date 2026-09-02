-- A rounded pin paired with an exact distance is still an exact-location
-- oracle: callers can move their own point and trilaterate the hidden raw fix.
-- Derive distance, radius membership, and ordering from the same rounded points
-- returned by the RPC so there is only one spatial precision boundary.
create or replace function private.find_nearby_people(p_radius_m double precision)
returns table (
  user_id uuid,
  distance_m double precision,
  latitude double precision,
  longitude double precision,
  headline text,
  emoji text,
  display_name text,
  handle text,
  avatar_url text,
  interests text[]
)
language sql
stable
security definer
set search_path = public
as $$
  -- Round the caller before any cross-user spatial calculation. Otherwise a
  -- spoofed caller point remains a fine-grained probe even when targets are
  -- rounded.
  with me as (
    select
      round(latitude::numeric, 3)::double precision as lat,
      round(longitude::numeric, 3)::double precision as lng
    from public.live_locations
    where user_id = auth.uid()
      and expires_at > now()
    limit 1
  ),
  visible as (
    select
      ll.user_id,
      round(ll.latitude::numeric, 3)::double precision as latitude,
      round(ll.longitude::numeric, 3)::double precision as longitude,
      ll.headline,
      ll.emoji,
      p.display_name,
      p.handle,
      p.avatar_url,
      coalesce(p.interests, '{}'::text[]) as interests
    from public.live_locations ll
    join public.profiles p on p.id = ll.user_id
    where ll.user_id <> auth.uid()
      and ll.expires_at > now()
      and not public.are_blocked(auth.uid(), ll.user_id)
      and (
        ll.visibility = 'sharers'
        or (
          ll.visibility = 'connections'
          and public.are_connected(auth.uid(), ll.user_id)
        )
      )
  ),
  distanced as (
    select
      visible.*,
      -- Great-circle distance in metres (haversine, R = 6371 km), using only
      -- the rounded points above. LEAST protects asin from floating-point
      -- overshoot at antipodal coordinates.
      (
        2 * 6371000 * asin(least(1::double precision, sqrt(
          power(sin(radians(visible.latitude - me.lat) / 2), 2)
          + cos(radians(me.lat)) * cos(radians(visible.latitude))
            * power(sin(radians(visible.longitude - me.lng) / 2), 2)
        )))
      )::double precision as distance_m
    from me
    cross join visible
  )
  select
    distanced.user_id,
    distanced.distance_m,
    distanced.latitude,
    distanced.longitude,
    distanced.headline,
    distanced.emoji,
    distanced.display_name,
    distanced.handle,
    distanced.avatar_url,
    distanced.interests
  from distanced
  where distanced.distance_m <= greatest(0, coalesce(p_radius_m, 5000))
  order by distanced.distance_m
  limit 200;
$$;

revoke all on function private.find_nearby_people(double precision)
  from public, anon;
grant execute on function private.find_nearby_people(double precision)
  to authenticated, service_role;
