-- People discovery keeps the promise the feature index makes (G5, D13).
--
-- The index says you meet people "only if you've chosen to be discoverable
-- yourself". `list_discoverable_people` never checked: anyone could browse
-- everyone who had opted in while staying invisible themselves, which is the
-- one-way mirror discovery was designed not to be. And the "Nearby" lane was
-- the `geography` flag — "this person lets their city show" — not a comparison
-- of anyone's location, so it listed opted-in people on other continents.
--
--   1. Browsing requires the caller to be discoverable and not on sabbatical
--      (a sabbatical hides you from discovery, so it hides discovery from you).
--      A caller who is not gets no rows, from any client.
--   2. `geography` now means "near you": both people opted into geography and
--      both home points are within 50 km. The comparison uses the same 0.25°
--      cells as the Home density check (`private.coarse_distance_m`,
--      20260902123000_home_density_signal_default.sql), because the caller's
--      home point is self-writable and this can be called at will: an exact
--      boundary test would locate someone's home. On ~28 km cells the most a
--      caller learns is someone's city-sized cell — less than the location
--      text that same person already chose to show here. Home points stay
--      unreadable; nothing new is returned.
--   3. A discovery interest ("Interested") is a write that should need the same
--      standing as browsing: an active `discover_connect` intent requires the
--      author to be discoverable. Withdrawing one (status <> 'active') is
--      always allowed, so turning discoverability off never traps an old one.
--
-- The return shape is unchanged. The body lives in `private` since
-- 20260717192758_move_definer_bodies_private.sql, behind the public wrapper.

create or replace function private.list_discoverable_people(p_category text default 'all')
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  tagline text,
  location text,
  pronouns text,
  categories text[],
  contexts text[],
  shared_interests text[],
  shared_down_to text[],
  mutual_friend_count int
)
language sql
stable
security definer
set search_path = public
as $$
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
$$;

revoke all on function private.list_discoverable_people(text) from public, anon;
grant execute on function private.list_discoverable_people(text)
  to authenticated, service_role;

-- Keep the author/block rules exactly as they were (F6,
-- 20260712120000_authz_hardening.sql) and add the discoverability standing for
-- an active discovery interest.
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
  );
