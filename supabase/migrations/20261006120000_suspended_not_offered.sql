-- A suspended account is offered to nobody as someone to meet.
--
-- A suspension is GoTrue's own ban (`auth.users.banned_until`,
-- 20260930070000_moderator_actions.sql): the person cannot sign in, and their
-- live tab is signed out. But the map, people discovery and Mutual never read
-- it. A suspended account's live pin stayed on strangers' maps until it
-- expired, its profile stayed in discovery indefinitely, and an interest it had
-- left before the suspension still turned someone's tap back into a match: a
-- private room with a person who cannot sign in to answer. That is a dead end
-- for the person who did nothing wrong.
--
--   1. `find_nearby_people` and `list_discoverable_people` skip suspended
--      accounts, read through `private.is_suspended`, the one copy of the state.
--   2. An active "down to connect" or discovery interest can be neither sent by
--      a suspended account (an access token issued before the suspension still
--      works until it expires, the same reason `messages` and `board_posts`
--      check it) nor aimed at one. Withdrawing is always allowed.
--
-- Lifting a suspension restores all of it: nothing is deleted. Bodies are the
-- live ones from 20260902023519 and 20260930042000 with the one added filter;
-- supabase/tests/proximity_matrix.test.sql walks the combinations.

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

create or replace function private.list_discoverable_people(p_category text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, display_name text, handle text, avatar_url text, tagline text, location text, pronouns text, categories text[], contexts text[], shared_interests text[], shared_down_to text[], mutual_friend_count integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with me as (
    -- Empty unless the caller is themselves discoverable, which empties
    -- everything below: see and be seen.
    select id, location, interests, down_to, discovery_geography,
           home_latitude, home_longitude
    from public.profiles
    where id = auth.uid()
      and discoverable
      and not coalesce(sabbatical, false)
  ),
  my_friends as (
    select case
      when c.requester_id = auth.uid() then c.addressee_id
      else c.requester_id
    end as friend_id
    from public.connections c
    where c.status = 'accepted'
      and (c.requester_id = auth.uid() or c.addressee_id = auth.uid())
  ),
  candidate_friends as (
    select
      p.id as candidate_id,
      case
        when c.requester_id = p.id then c.addressee_id
        else c.requester_id
      end as friend_id
    from public.profiles p
    join public.connections c
      on c.status = 'accepted'
     and (c.requester_id = p.id or c.addressee_id = p.id)
    where p.discoverable
  ),
  scored as (
    select
      p.id,
      p.display_name,
      p.handle,
      p.avatar_url,
      p.tagline,
      case when p.discovery_geography then p.location else null end as location,
      case when p.discovery_demographics then p.pronouns else null end as pronouns,
      array_remove(array[
        case
          when p.discovery_geography
           and me.discovery_geography
           and me.home_latitude is not null and me.home_longitude is not null
           and p.home_latitude is not null and p.home_longitude is not null
           and private.coarse_distance_m(
                 me.home_latitude, me.home_longitude,
                 p.home_latitude, p.home_longitude
               ) <= 50000
          then 'geography'
        end,
        case when p.discovery_demographics then 'demographics' end,
        case when p.discovery_interests then 'interests' end,
        case when p.discovery_involvements then 'involvements' end,
        case when p.discovery_mutuals then 'mutual friends' end
      ], null) as categories,
      case
        when cardinality(p.discovery_contexts) > 0 then p.discovery_contexts
        else coalesce(p.down_to, '{}')
      end as contexts,
      case when p.discovery_interests
        then array(select unnest(coalesce(p.interests, '{}')) intersect select unnest(coalesce(me.interests, '{}')))
        else '{}'::text[]
      end as shared_interests,
      array(select unnest(coalesce(p.down_to, '{}')) intersect select unnest(coalesce(me.down_to, '{}'))) as shared_down_to,
      case when p.discovery_mutuals
        then (
          select count(*)::int
          from candidate_friends cf
          join my_friends mf on mf.friend_id = cf.friend_id
          where cf.candidate_id = p.id
        )
        else 0
      end as mutual_friend_count
    from public.profiles p
    cross join me
    where p.discoverable
      and p.id <> auth.uid()
      and not coalesce(p.sabbatical, false)
      and not public.are_blocked(auth.uid(), p.id)
      and not private.is_suspended(p.id)
      and not exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.requester_id = auth.uid() and c.addressee_id = p.id)
            or (c.requester_id = p.id and c.addressee_id = auth.uid()))
      )
  )
  select *
  from scored
  where p_category = 'all'
     or p_category = any(categories)
  order by mutual_friend_count desc, cardinality(shared_interests) desc, display_name asc
  limit 40;
$function$

;

-- Keep every rule from 20260930080000_sabbatical_mode.sql and add the
-- suspension: neither side of an active connect interest may be suspended.
alter policy mutual_intents_own on public.mutual_intents
  with check (
    author_id = (select auth.uid())
    and (target_id is null or not private.are_blocked((select auth.uid()), target_id))
    and (
      kind <> 'discover_connect'
      or status <> 'active'
      or exists (
        select 1
        from public.profiles me
        where me.id = (select auth.uid())
          and me.discoverable
          and not coalesce(me.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not exists (
        select 1
        from public.profiles p
        where p.id in ((select auth.uid()), target_id)
          and coalesce(p.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not (
        private.is_suspended((select auth.uid()))
        or (target_id is not null and private.is_suspended(target_id))
      )
    )
  );
