-- Every combination of settings two people can be in, walked against the real
-- proximity and matching functions: does each person see the other exactly
-- when their settings say they should, and does mutual interest become a match?
--
-- The single-case tests (live_location, discovery_requires_discoverable,
-- shared_moments_distance) each pin one rule. This walks the cross product, so
-- a combination nobody thought to write down still has an expected answer.
--
-- Shape: a driver sets two accounts (Ana, the viewer, and Bo, the other person)
-- into one combination as the migration role, then calls the RPC as each of
-- them under `authenticated` with their own JWT. `expected` is written here,
-- independently of the SQL under test. Each section asserts zero mismatches and
-- prints every mismatching combination, so a failure names the case.

begin;
select plan(12);

-- ————————————————————————— two people —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a0001', 'pm-ana@example.com'),
  ('00000000-0000-0000-0000-0000000b0002', 'pm-bo@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000a0001', 'PM Ana', true),
  ('00000000-0000-0000-0000-0000000b0002', 'PM Bo', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

create function pg_temp.ana() returns uuid language sql immutable
  as $$ select '00000000-0000-0000-0000-0000000a0001'::uuid $$;
create function pg_temp.bo() returns uuid language sql immutable
  as $$ select '00000000-0000-0000-0000-0000000b0002'::uuid $$;

-- Act as `who` for one statement's worth of work, then come back.
create function pg_temp.act_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- A relationship between the two: none, either one blocking, or connected.
create function pg_temp.relate(rel text) returns void language plpgsql as $$
begin
  delete from public.profile_blocks
   where blocker_id in (pg_temp.ana(), pg_temp.bo());
  delete from public.connections
   where requester_id in (pg_temp.ana(), pg_temp.bo())
      or addressee_id in (pg_temp.ana(), pg_temp.bo());
  if rel = 'ana_blocks' then
    insert into public.profile_blocks (blocker_id, blocked_id) values (pg_temp.ana(), pg_temp.bo());
  elsif rel = 'bo_blocks' then
    insert into public.profile_blocks (blocker_id, blocked_id) values (pg_temp.bo(), pg_temp.ana());
  elsif rel = 'connected' then
    insert into public.connections (requester_id, addressee_id, status)
      values (pg_temp.ana(), pg_temp.bo(), 'accepted');
  end if;
end $$;

create temp table mismatches (section text, cell text);
grant all on mismatches to authenticated;

-- ═════════════════════════ 1. live location (the map) ═════════════════════════
-- Ana asks for people within 5 km. Bo appears exactly when both are sharing
-- right now, neither blocks the other, Bo's scope admits Ana, and Bo is within
-- the radius. Distances are chosen well clear of the ~110 m rounding.
do $$
declare
  ana_share text; bo_share text; bo_scope text; rel text; dist text;
  bo_lat double precision;
  seen boolean; expected boolean;
begin
  foreach ana_share in array array['none', 'live', 'expired'] loop
  foreach bo_share in array array['none', 'live', 'expired'] loop
  foreach bo_scope in array array['sharers', 'connections'] loop
  foreach rel in array array['none', 'ana_blocks', 'bo_blocks', 'connected'] loop
  foreach dist in array array['300m', '4.5km', '6km', '2500km'] loop
    perform pg_temp.relate(rel);
    delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());

    if ana_share <> 'none' then
      insert into public.live_locations (user_id, latitude, longitude, visibility, expires_at)
      values (pg_temp.ana(), 39.7392, -104.9903, 'sharers',
              case ana_share when 'live' then now() + interval '1 hour'
                             else now() - interval '1 minute' end);
    end if;
    bo_lat := 39.7392 + case dist
      when '300m' then 0.0027 when '4.5km' then 0.0405
      when '6km' then 0.054 else 22.0 end;
    if bo_share <> 'none' then
      insert into public.live_locations (user_id, latitude, longitude, visibility, expires_at)
      values (pg_temp.bo(), bo_lat, -104.9903, bo_scope,
              case bo_share when 'live' then now() + interval '1 hour'
                            else now() - interval '1 minute' end);
    end if;

    perform pg_temp.act_as(pg_temp.ana());
    seen := exists (select 1 from public.find_nearby_people(5000) n where n.user_id = pg_temp.bo());
    perform pg_temp.back();

    expected := ana_share = 'live'
      and bo_share = 'live'
      and rel not in ('ana_blocks', 'bo_blocks')
      and (bo_scope = 'sharers' or rel = 'connected')
      and dist in ('300m', '4.5km');

    if seen is distinct from expected then
      insert into mismatches values ('live',
        format('ana=%s bo=%s scope=%s rel=%s dist=%s: saw=%s expected=%s',
               ana_share, bo_share, bo_scope, rel, dist, seen, expected));
    end if;
  end loop; end loop; end loop; end loop; end loop;
  delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());
end $$;

select is(
  (select count(*)::int from mismatches where section = 'live'),
  0,
  'find_nearby_people: Bo is on Ana''s map exactly when both share, nobody blocks, Bo''s scope admits Ana, and Bo is within the radius (288 combinations)'
);
select diag(cell) from mismatches where section = 'live';

-- The radius the caller asks for is the radius they get, on both sides of it.
do $$
declare r double precision; seen boolean;
begin
  perform pg_temp.relate('none');
  insert into public.live_locations (user_id, latitude, longitude, visibility, expires_at) values
    (pg_temp.ana(), 39.7392, -104.9903, 'sharers', now() + interval '1 hour'),
    -- ~2.0 km north
    (pg_temp.bo(), 39.7572, -104.9903, 'sharers', now() + interval '1 hour');
  foreach r in array array[500, 1000, 1900, 2100, 5000, 25000]::double precision[] loop
    perform pg_temp.act_as(pg_temp.ana());
    seen := exists (select 1 from public.find_nearby_people(r) n where n.user_id = pg_temp.bo());
    perform pg_temp.back();
    if seen is distinct from (r >= 2100) then
      insert into mismatches values ('radius', format('radius=%s saw=%s', r, seen));
    end if;
  end loop;
  delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());
end $$;

select is(
  (select count(*)::int from mismatches where section = 'radius'),
  0,
  'find_nearby_people: someone 2 km away is outside a 500 m, 1 km and 1.9 km radius and inside 2.1 km, 5 km and 25 km'
);
select diag(cell) from mismatches where section = 'radius';

-- Seeing on the map is mutual when both chose "anyone sharing": if Ana sees Bo,
-- Bo sees Ana, at every distance and relationship.
do $$
declare rel text; dist double precision; a_sees boolean; b_sees boolean;
begin
  foreach rel in array array['none', 'ana_blocks', 'bo_blocks', 'connected'] loop
  foreach dist in array array[0.001, 0.02, 0.0449, 0.0451, 0.2]::double precision[] loop
    perform pg_temp.relate(rel);
    delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());
    insert into public.live_locations (user_id, latitude, longitude, visibility, expires_at) values
      (pg_temp.ana(), 39.7392, -104.9903, 'sharers', now() + interval '1 hour'),
      (pg_temp.bo(), 39.7392 + dist, -104.9903, 'sharers', now() + interval '1 hour');
    perform pg_temp.act_as(pg_temp.ana());
    a_sees := exists (select 1 from public.find_nearby_people(5000) n where n.user_id = pg_temp.bo());
    perform pg_temp.back();
    perform pg_temp.act_as(pg_temp.bo());
    b_sees := exists (select 1 from public.find_nearby_people(5000) n where n.user_id = pg_temp.ana());
    perform pg_temp.back();
    if a_sees is distinct from b_sees then
      insert into mismatches values ('live-symmetry',
        format('rel=%s dlat=%s ana_sees=%s bo_sees=%s', rel, dist, a_sees, b_sees));
    end if;
  end loop; end loop;
  delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());
end $$;

select is(
  (select count(*)::int from mismatches where section = 'live-symmetry'),
  0,
  'find_nearby_people: between two "anyone sharing" people, seeing is mutual at every distance (including right at the 5 km edge) and relationship'
);
select diag(cell) from mismatches where section = 'live-symmetry';

-- ═════════════════════════ 2. people discovery ═════════════════════════
-- Bo is listed for Ana exactly when both are discoverable, neither is on
-- sabbatical, neither blocks the other, and they are not already connected.
-- Bo carries the "geography" (near you) tag exactly when, on top of that, both
-- opted into geography, both have a home point, and the homes are near.
do $$
declare
  a_disc boolean; a_sab boolean; a_geo boolean;
  b_disc boolean; b_sab boolean; b_geo boolean;
  home text; rel text;
  row_cats text[]; listed boolean; tagged boolean; in_lane boolean;
  exp_listed boolean; exp_tagged boolean;
begin
  foreach a_disc in array array[true, false] loop
  foreach a_sab in array array[false, true] loop
  foreach a_geo in array array[true, false] loop
  foreach b_disc in array array[true, false] loop
  foreach b_sab in array array[false, true] loop
  foreach b_geo in array array[true, false] loop
  foreach home in array array['10km', '200km', 'bo_unset', 'ana_unset'] loop
  foreach rel in array array['none', 'ana_blocks', 'bo_blocks', 'connected'] loop
    perform pg_temp.relate(rel);
    update public.profiles set
      discoverable = a_disc, sabbatical = a_sab, discovery_geography = a_geo,
      home_latitude = case when home = 'ana_unset' then null else 39.7392 end,
      home_longitude = case when home = 'ana_unset' then null else -104.9903 end
    where id = pg_temp.ana();
    update public.profiles set
      discoverable = b_disc, sabbatical = b_sab, discovery_geography = b_geo,
      home_latitude = case home when '10km' then 39.8292 when '200km' then 41.5392 end,
      home_longitude = case when home in ('10km', '200km') then -104.9903 end
    where id = pg_temp.bo();

    perform pg_temp.act_as(pg_temp.ana());
    select d.categories into row_cats
      from public.list_discoverable_people('all') d where d.id = pg_temp.bo();
    listed := found;
    in_lane := exists (select 1 from public.list_discoverable_people('geography') d
                        where d.id = pg_temp.bo());
    perform pg_temp.back();
    tagged := listed and 'geography' = any(row_cats);

    exp_listed := a_disc and not a_sab and b_disc and not b_sab and rel = 'none';
    exp_tagged := exp_listed and a_geo and b_geo and home = '10km';

    if listed is distinct from exp_listed
       or tagged is distinct from exp_tagged
       or in_lane is distinct from exp_tagged then
      insert into mismatches values ('discovery',
        format('ana(disc=%s sab=%s geo=%s) bo(disc=%s sab=%s geo=%s) home=%s rel=%s: listed=%s/%s near=%s/%s lane=%s',
               a_disc, a_sab, a_geo, b_disc, b_sab, b_geo, home, rel,
               listed, exp_listed, tagged, exp_tagged, in_lane));
    end if;
  end loop; end loop; end loop; end loop; end loop; end loop; end loop; end loop;
end $$;

select is(
  (select count(*)::int from mismatches where section = 'discovery'),
  0,
  'list_discoverable_people: listed and "near you" exactly when both people''s settings allow it (1,024 combinations)'
);
select diag(cell) from mismatches where section = 'discovery';

-- See and be seen: for every pair of settings, Ana lists Bo exactly when Bo
-- lists Ana, and the "near you" tag agrees from both sides.
do $$
declare
  a_disc boolean; a_sab boolean; a_geo boolean;
  b_disc boolean; b_sab boolean; b_geo boolean;
  rel text;
  a_cats text[]; b_cats text[]; a_lists boolean; b_lists boolean;
begin
  foreach a_disc in array array[true, false] loop
  foreach a_sab in array array[false, true] loop
  foreach a_geo in array array[true, false] loop
  foreach b_disc in array array[true, false] loop
  foreach b_sab in array array[false, true] loop
  foreach b_geo in array array[true, false] loop
  foreach rel in array array['none', 'ana_blocks', 'bo_blocks', 'connected'] loop
    perform pg_temp.relate(rel);
    update public.profiles set discoverable = a_disc, sabbatical = a_sab,
      discovery_geography = a_geo, home_latitude = 39.7392, home_longitude = -104.9903
     where id = pg_temp.ana();
    update public.profiles set discoverable = b_disc, sabbatical = b_sab,
      discovery_geography = b_geo, home_latitude = 39.8292, home_longitude = -104.9903
     where id = pg_temp.bo();

    perform pg_temp.act_as(pg_temp.ana());
    select d.categories into a_cats from public.list_discoverable_people('all') d where d.id = pg_temp.bo();
    a_lists := found;
    perform pg_temp.back();
    perform pg_temp.act_as(pg_temp.bo());
    select d.categories into b_cats from public.list_discoverable_people('all') d where d.id = pg_temp.ana();
    b_lists := found;
    perform pg_temp.back();

    if a_lists is distinct from b_lists
       or coalesce('geography' = any(a_cats), false) is distinct from coalesce('geography' = any(b_cats), false) then
      insert into mismatches values ('discovery-symmetry',
        format('ana(disc=%s sab=%s geo=%s) bo(disc=%s sab=%s geo=%s) rel=%s: ana_lists_bo=%s bo_lists_ana=%s',
               a_disc, a_sab, a_geo, b_disc, b_sab, b_geo, rel, a_lists, b_lists));
    end if;
  end loop; end loop; end loop; end loop; end loop; end loop; end loop;
end $$;

select is(
  (select count(*)::int from mismatches where section = 'discovery-symmetry'),
  0,
  'list_discoverable_people: see and be seen, from both sides, for every pair of settings (256 combinations)'
);
select diag(cell) from mismatches where section = 'discovery-symmetry';

-- "Near you" compares 0.25° cells (~28 km), not exact points, so its edge is
-- soft by design. What it must still promise: anyone within 15 km is always
-- near, and anyone 100 km or more away never is, wherever the two homes fall
-- in their cells. Sampled across a grid of offsets and bearings.
do $$
declare
  base_lat double precision; base_lng double precision;
  step int; bearing int; km double precision;
  b_lat double precision; b_lng double precision; tagged boolean;
begin
  perform pg_temp.relate('none');
  update public.profiles set discoverable = true, sabbatical = false, discovery_geography = true
   where id in (pg_temp.ana(), pg_temp.bo());
  for step in 0..7 loop
    -- Walk Ana across one cell so every position within it is represented.
    base_lat := 39.70 + step * 0.031;
    base_lng := -105.00 + step * 0.031;
    update public.profiles set home_latitude = base_lat, home_longitude = base_lng
     where id = pg_temp.ana();
    foreach km in array array[1, 8, 15, 100, 250]::double precision[] loop
    for bearing in 0..7 loop
      b_lat := base_lat + (km / 111.32) * cos(radians(bearing * 45));
      b_lng := base_lng + (km / (111.32 * cos(radians(base_lat)))) * sin(radians(bearing * 45));
      update public.profiles set home_latitude = b_lat, home_longitude = b_lng
       where id = pg_temp.bo();
      perform pg_temp.act_as(pg_temp.ana());
      tagged := exists (select 1 from public.list_discoverable_people('geography') d
                         where d.id = pg_temp.bo());
      perform pg_temp.back();
      if (km <= 15 and not tagged) or (km >= 100 and tagged) then
        insert into mismatches values ('near-edge',
          format('ana=(%s,%s) %s km at %s°: near=%s',
                 round(base_lat::numeric, 3), round(base_lng::numeric, 3), km, bearing * 45, tagged));
      end if;
    end loop; end loop;
  end loop;
end $$;

select is(
  (select count(*)::int from mismatches where section = 'near-edge'),
  0,
  '"Near you": within 15 km is always near and 100 km or more never is, wherever the homes fall in their cells'
);
select diag(cell) from mismatches where section = 'near-edge';

-- ═════════════════════════ 3. a discovery match ═════════════════════════
-- Ana taps "Interested" on Bo for a context, then Bo on Ana for the same
-- context. Each tap is refused exactly when the author may not browse
-- (not discoverable, or on sabbatical), the target is on sabbatical, or either
-- blocks the other. A match forms exactly when both taps are accepted.
do $$
declare
  a_disc boolean; a_sab boolean; b_disc boolean; b_sab boolean; rel text;
  a_ok boolean; b_ok boolean; matched boolean;
  exp_a boolean; exp_b boolean;
begin
  foreach a_disc in array array[true, false] loop
  foreach a_sab in array array[false, true] loop
  foreach b_disc in array array[true, false] loop
  foreach b_sab in array array[false, true] loop
  foreach rel in array array['none', 'ana_blocks', 'bo_blocks', 'connected'] loop
    perform pg_temp.relate(rel);
    delete from public.matches where pg_temp.ana() in (user_a, user_b);
    delete from public.mutual_intents where author_id in (pg_temp.ana(), pg_temp.bo());
    update public.profiles set discoverable = a_disc, sabbatical = a_sab where id = pg_temp.ana();
    update public.profiles set discoverable = b_disc, sabbatical = b_sab where id = pg_temp.bo();

    perform pg_temp.act_as(pg_temp.ana());
    begin
      insert into public.mutual_intents (author_id, target_id, activity, kind)
        values (pg_temp.ana(), pg_temp.bo(), 'Coffee', 'discover_connect');
      a_ok := true;
    exception when insufficient_privilege or check_violation then a_ok := false;
    end;
    perform pg_temp.back();
    perform pg_temp.act_as(pg_temp.bo());
    begin
      insert into public.mutual_intents (author_id, target_id, activity, kind)
        values (pg_temp.bo(), pg_temp.ana(), 'Coffee', 'discover_connect');
      b_ok := true;
    exception when insufficient_privilege or check_violation then b_ok := false;
    end;
    perform pg_temp.back();

    matched := exists (select 1 from public.matches
                        where user_a = least(pg_temp.ana(), pg_temp.bo())
                          and user_b = greatest(pg_temp.ana(), pg_temp.bo())
                          and kind = 'discover_connect');
    exp_a := a_disc and not a_sab and not b_sab and rel not in ('ana_blocks', 'bo_blocks');
    exp_b := b_disc and not b_sab and not a_sab and rel not in ('ana_blocks', 'bo_blocks');

    if a_ok is distinct from exp_a or b_ok is distinct from exp_b
       or matched is distinct from (exp_a and exp_b) then
      insert into mismatches values ('match',
        format('ana(disc=%s sab=%s) bo(disc=%s sab=%s) rel=%s: ana_tap=%s/%s bo_tap=%s/%s matched=%s',
               a_disc, a_sab, b_disc, b_sab, rel, a_ok, exp_a, b_ok, exp_b, matched));
    end if;
  end loop; end loop; end loop; end loop; end loop;
  delete from public.matches where pg_temp.ana() in (user_a, user_b);
  delete from public.mutual_intents where author_id in (pg_temp.ana(), pg_temp.bo());
end $$;

select is(
  (select count(*)::int from mismatches where section = 'match'),
  0,
  'discover_connect: each tap is accepted exactly when the settings allow it, and two accepted taps make one match (64 combinations)'
);
select diag(cell) from mismatches where section = 'match';

-- A match gives both people the same private room, and nobody else.
do $$
begin
  perform pg_temp.relate('none');
  update public.profiles set discoverable = true, sabbatical = false
   where id in (pg_temp.ana(), pg_temp.bo());
  perform pg_temp.act_as(pg_temp.ana());
  insert into public.mutual_intents (author_id, target_id, activity, kind)
    values (pg_temp.ana(), pg_temp.bo(), 'Coffee', 'discover_connect');
  perform pg_temp.back();
  perform pg_temp.act_as(pg_temp.bo());
  insert into public.mutual_intents (author_id, target_id, activity, kind)
    values (pg_temp.bo(), pg_temp.ana(), 'Coffee', 'discover_connect');
  perform pg_temp.back();
end $$;

select is(
  (select array_agg(rm.member_id order by rm.member_id)
     from public.matches m join public.room_members rm on rm.room_id = m.room_id
    where m.user_a = least(pg_temp.ana(), pg_temp.bo()) and m.kind = 'discover_connect'),
  array[pg_temp.ana(), pg_temp.bo()],
  'a discovery match opens one room whose members are exactly the two people'
);

-- Withdrawing and re-sending an interest still matches: the trigger fires on
-- the status flip back to active, not only on a fresh insert.
do $$
begin
  delete from public.matches where pg_temp.ana() in (user_a, user_b);
  delete from public.mutual_intents where author_id in (pg_temp.ana(), pg_temp.bo());
  perform pg_temp.act_as(pg_temp.ana());
  insert into public.mutual_intents (author_id, target_id, activity, kind)
    values (pg_temp.ana(), pg_temp.bo(), 'Coffee', 'discover_connect');
  update public.mutual_intents set status = 'withdrawn'
   where author_id = pg_temp.ana() and kind = 'discover_connect';
  perform pg_temp.back();
  perform pg_temp.act_as(pg_temp.bo());
  insert into public.mutual_intents (author_id, target_id, activity, kind)
    values (pg_temp.bo(), pg_temp.ana(), 'Coffee', 'discover_connect');
  perform pg_temp.back();
  perform pg_temp.act_as(pg_temp.ana());
  update public.mutual_intents set status = 'active'
   where author_id = pg_temp.ana() and kind = 'discover_connect';
  perform pg_temp.back();
end $$;

select is(
  (select count(*)::int from public.matches
    where user_a = least(pg_temp.ana(), pg_temp.bo()) and kind = 'discover_connect'),
  1,
  'an interest withdrawn and re-sent after the other person tapped still makes exactly one match'
);

-- ═════════════════════════ 4. shared moments (check-ins) ═════════════════════════
-- Two open check-ins outside any zone. Located on both sides, they match by
-- distance whatever either typed; with either side unlocated, only the same
-- typed name matches. Blocks always win.
--
-- The 200 m is measured between points rounded to 0.001° (~110 m), so the edge
-- is soft: depending on where two people fall in their cells, 113 m apart can
-- miss and ~310 m apart can match. What is guaranteed, and asserted here: under
-- 0.001° on each axis (~85 m in any direction) always matches, and 350 m or more
-- never does.
do $$
declare
  dist text; same_name boolean; located text; rel text;
  b_lat double precision; seen boolean; expected boolean; bo_moment uuid;
begin
  foreach dist in array array['20m', '80m', '400m', '2km'] loop
  foreach same_name in array array[true, false] loop
  foreach located in array array['both', 'ana_only', 'neither'] loop
  foreach rel in array array['none', 'ana_blocks', 'bo_blocks'] loop
    perform pg_temp.relate(rel);
    delete from public.moments where user_id in (pg_temp.ana(), pg_temp.bo());
    b_lat := 39.7392 + case dist when '20m' then 0.0002 when '80m' then 0.00072
                                 when '400m' then 0.0036 else 0.018 end;
    insert into public.moments (user_id, place_name, latitude, longitude, experiences, status, available_until)
    values
      (pg_temp.ana(), 'Cafe Luna',
       case when located in ('both', 'ana_only') then 39.7392 end,
       case when located in ('both', 'ana_only') then -104.9903 end,
       array['coffee'], 'open', now() + interval '1 hour'),
      (pg_temp.bo(), case when same_name then 'cafe luna' else 'Café Luna, 5th St' end,
       case when located = 'both' then b_lat end,
       case when located = 'both' then -104.9903 end,
       array['coffee'], 'open', now() + interval '1 hour');
    -- Moments are anonymous, so Ana cannot read Bo's row: look its id up here.
    select id into bo_moment from public.moments where user_id = pg_temp.bo();

    perform pg_temp.act_as(pg_temp.ana());
    seen := exists (select 1 from public.find_shared_moments('Cafe Luna') f where f.id = bo_moment);
    perform pg_temp.back();

    expected := rel = 'none' and (
      (located = 'both' and dist in ('20m', '80m'))
      or (located <> 'both' and same_name)
    );
    if seen is distinct from expected then
      insert into mismatches values ('moments',
        format('dist=%s same_name=%s located=%s rel=%s: saw=%s expected=%s',
               dist, same_name, located, rel, seen, expected));
    end if;
  end loop; end loop; end loop; end loop;
  delete from public.moments where user_id in (pg_temp.ana(), pg_temp.bo());
end $$;

select is(
  (select count(*)::int from mismatches where section = 'moments'),
  0,
  'find_shared_moments: located check-ins match nearby (80 m yes, 400 m no) whatever was typed, unlocated ones by name, blocks always win (96 combinations)'
);
select diag(cell) from mismatches where section = 'moments';

-- ═════════════════════════ 5. what pauses or removes a person ═════════════════════════
-- Settings promises a sabbatical drops you out of discovery and matching
-- (covered above). A suspended account cannot sign in, so it must not be
-- offered to anyone as someone to meet: not on the map, not in discovery.
do $$
declare on_map boolean; in_discovery boolean;
begin
  perform pg_temp.relate('none');
  update public.profiles set discoverable = true, sabbatical = false, discovery_geography = true,
    home_latitude = 39.7392, home_longitude = -104.9903 where id in (pg_temp.ana(), pg_temp.bo());
  delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());
  insert into public.live_locations (user_id, latitude, longitude, visibility, expires_at) values
    (pg_temp.ana(), 39.7392, -104.9903, 'sharers', now() + interval '1 hour'),
    (pg_temp.bo(), 39.7400, -104.9903, 'sharers', now() + interval '1 hour');
  update auth.users set banned_until = now() + interval '100 years' where id = pg_temp.bo();

  perform pg_temp.act_as(pg_temp.ana());
  on_map := exists (select 1 from public.find_nearby_people(5000) n where n.user_id = pg_temp.bo());
  in_discovery := exists (select 1 from public.list_discoverable_people('all') d where d.id = pg_temp.bo());
  perform pg_temp.back();

  if on_map then insert into mismatches values ('suspended', 'a suspended account is on the map'); end if;
  if in_discovery then insert into mismatches values ('suspended', 'a suspended account is listed in discovery'); end if;
  update auth.users set banned_until = null where id = pg_temp.bo();
end $$;

select is(
  (select count(*)::int from mismatches where section = 'suspended'),
  0,
  'a suspended account is offered to nobody: not on the map, not in discovery'
);
select diag(cell) from mismatches where section = 'suspended';

-- Nor matched: Bo tapped Interested on Ana before he was suspended. Ana's tap
-- back must not open a room with someone who cannot sign in to answer, and a
-- fresh interest aimed at him is refused.
do $$
declare ana_ok boolean;
begin
  delete from public.live_locations where user_id in (pg_temp.ana(), pg_temp.bo());
  delete from public.matches where pg_temp.ana() in (user_a, user_b);
  delete from public.mutual_intents where author_id in (pg_temp.ana(), pg_temp.bo());
  perform pg_temp.act_as(pg_temp.bo());
  insert into public.mutual_intents (author_id, target_id, activity, kind)
    values (pg_temp.bo(), pg_temp.ana(), 'Coffee', 'discover_connect');
  perform pg_temp.back();
  update auth.users set banned_until = now() + interval '100 years' where id = pg_temp.bo();

  perform pg_temp.act_as(pg_temp.ana());
  begin
    insert into public.mutual_intents (author_id, target_id, activity, kind)
      values (pg_temp.ana(), pg_temp.bo(), 'Coffee', 'discover_connect');
    ana_ok := true;
  exception when insufficient_privilege or check_violation then ana_ok := false;
  end;
  perform pg_temp.back();

  if ana_ok then insert into mismatches values ('suspended-match', 'an interest aimed at a suspended account was accepted'); end if;
  if exists (select 1 from public.matches where pg_temp.ana() in (user_a, user_b)) then
    insert into mismatches values ('suspended-match', 'a match formed with a suspended account');
  end if;
  update auth.users set banned_until = null where id = pg_temp.bo();
end $$;

select is(
  (select count(*)::int from mismatches where section = 'suspended-match'),
  0,
  'nobody is matched with a suspended account, even one whose interest predates the suspension'
);
select diag(cell) from mismatches where section = 'suspended-match';

select * from finish();
rollback;
