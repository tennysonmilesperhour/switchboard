-- Live location: opt-in, ephemeral, mutual "who's sharing nearby" presence.
--
-- This is the spatial layer that ties Moments (a personal live check-in) and
-- Zones (a place/gathering) to the Map. A user explicitly turns location on;
-- their coordinate is stored on a single owner-only row that AUTO-EXPIRES, and
-- other people are discovered ONLY through a security-definer RPC that enforces
-- the privacy contract. Precise coordinates of one user are never directly
-- SELECT-able by another — the table is owner-only under RLS.
--
-- Privacy contract (see docs/SECURITY.md §"Live location"):
--   * Sharing is opt-in and time-boxed (expires_at); stale rows are ignored at
--     read time and swept by the retention cron.
--   * Discovery is MUTUAL: find_nearby_people returns rows only to a caller who
--     is themselves currently sharing ("see and be seen").
--   * Blocks are enforced (are_blocked); a 'connections' visibility limits a
--     user to their accepted connections, 'sharers' is visible to any sharer.
--   * Returned coordinates are COARSENED (rounded to ~110 m) so a fellow sharer
--     sees roughly where someone is, never their exact doorstep.

create table if not exists public.live_locations (
  -- One live row per user; the PK doubles as the owner column, and RLS pins it
  -- to auth.uid() on every write so it can never be repointed at someone else.
  user_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_m double precision,
  -- A short, optional public note shown to fellow sharers (e.g. "at the market").
  headline text,
  -- An optional status emoji shown on the map pin.
  emoji text,
  visibility text not null default 'sharers'
    check (visibility in ('sharers', 'connections')),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint live_locations_coords_range check (
    latitude between -90 and 90 and longitude between -180 and 180
  ),
  constraint live_locations_headline_len check (headline is null or char_length(headline) <= 90),
  constraint live_locations_emoji_len check (emoji is null or char_length(emoji) <= 8)
);

-- Discovery filters by freshness constantly; index the expiry.
create index if not exists live_locations_expires_idx
  on public.live_locations (expires_at);

alter table public.live_locations enable row level security;

-- Owner-only in every direction. Because user_id = auth.uid() is required by
-- BOTH the USING and WITH CHECK clauses, a user can neither read/modify another
-- user's row nor repoint their own row's owner column (docs/SECURITY.md §2).
-- Cross-user discovery is exclusively via find_nearby_people below.
create policy live_locations_select_own on public.live_locations
  for select to authenticated using (user_id = auth.uid());
create policy live_locations_insert_own on public.live_locations
  for insert to authenticated with check (user_id = auth.uid());
create policy live_locations_update_own on public.live_locations
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy live_locations_delete_own on public.live_locations
  for delete to authenticated using (user_id = auth.uid());

-- ————————————————————————— nearby discovery —————————————————————————
-- SECURITY DEFINER body lives in the private schema (the exposed-API convention
-- established in 20260717192758_move_definer_bodies_private.sql); a thin public
-- SECURITY INVOKER wrapper is what PostgREST exposes as the RPC.
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
  -- The caller's own live point. Empty (⇒ whole query empty) unless the caller
  -- is themselves currently sharing: discovery is mutual by construction.
  with me as (
    select latitude as lat, longitude as lng
    from public.live_locations
    where user_id = auth.uid() and expires_at > now()
    limit 1
  )
  select
    ll.user_id,
    -- Great-circle distance in metres (haversine, R = 6371 km).
    (2 * 6371000 * asin(sqrt(
      power(sin(radians(ll.latitude - me.lat) / 2), 2)
      + cos(radians(me.lat)) * cos(radians(ll.latitude))
        * power(sin(radians(ll.longitude - me.lng) / 2), 2)
    )))::double precision as distance_m,
    -- Coarsen to ~110 m so a fellow sharer sees the neighbourhood, not the door.
    round(ll.latitude::numeric, 3)::double precision as latitude,
    round(ll.longitude::numeric, 3)::double precision as longitude,
    ll.headline,
    ll.emoji,
    p.display_name,
    p.handle,
    p.avatar_url,
    coalesce(p.interests, '{}'::text[]) as interests
  from me
  join public.live_locations ll
    on ll.user_id <> auth.uid()
   and ll.expires_at > now()
  join public.profiles p on p.id = ll.user_id
  where not public.are_blocked(auth.uid(), ll.user_id)
    and (
      ll.visibility = 'sharers'
      or (ll.visibility = 'connections' and public.are_connected(auth.uid(), ll.user_id))
    )
    and (2 * 6371000 * asin(sqrt(
      power(sin(radians(ll.latitude - me.lat) / 2), 2)
      + cos(radians(me.lat)) * cos(radians(ll.latitude))
        * power(sin(radians(ll.longitude - me.lng) / 2), 2)
    ))) <= greatest(0, coalesce(p_radius_m, 5000))
  order by distance_m
  limit 200;
$$;

revoke all on function private.find_nearby_people(double precision) from public, anon;
grant execute on function private.find_nearby_people(double precision) to authenticated, service_role;

create or replace function public.find_nearby_people(p_radius_m double precision default 5000)
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
security invoker
set search_path = ''
as $$
  select * from private.find_nearby_people(p_radius_m);
$$;

revoke all on function public.find_nearby_people(double precision) from public, anon;
grant execute on function public.find_nearby_people(double precision) to authenticated, service_role;
