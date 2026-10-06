-- A live pin is live only while its phone is still saying where it is.
--
-- A share lasted its full window (two hours by default) whatever the phone did.
-- When the screen locks, the browser stops running the page and nothing more is
-- sent, but the last point stayed on everyone's map until the window ran out:
-- someone who left the café an hour ago still showed as "here". Measured with a
-- simulated locked phone: visible to a neighbour after an hour of silence.
--
--   1. `updated_at` is the server's clock, stamped on every write. It was
--      self-written, so a client could set it in the future and never go
--      stale; now the database sets it and nothing else can.
--   2. `find_nearby_people` skips a pin with no write in the last 15 minutes.
--      An open map page writes at least every 4 minutes (a heartbeat in
--      src/lib/client/position-sender.ts), so only a page that has stopped
--      running goes quiet. When it comes back, its first fix makes the pin
--      live again; nothing is deleted, and the share still ends on schedule.
--
-- The caller's own row is not held to this: asking is itself a sign of life.
-- supabase/tests/proximity_matrix.test.sql walks it.

create or replace function private.stamp_live_location_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.stamp_live_location_write() from public, anon, authenticated;
grant execute on function private.stamp_live_location_write() to service_role;

drop trigger if exists live_locations_stamp_write on public.live_locations;
create trigger live_locations_stamp_write
  before insert or update on public.live_locations
  for each row execute function private.stamp_live_location_write();

create or replace function private.find_nearby_people(p_radius_m double precision)
 RETURNS TABLE(user_id uuid, distance_m double precision, latitude double precision, longitude double precision, headline text, emoji text, display_name text, handle text, avatar_url text, interests text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      and not exists (
        select 1 from public.profiles me
        where me.id = auth.uid() and me.sabbatical
      )
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
      and not private.is_suspended(ll.user_id)
      and not p.sabbatical
      -- Still being heard from: see the header.
      and ll.updated_at > now() - interval '15 minutes'
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
$function$

;
