-- pgTAP tests for live location sharing (20260718120000_live_location.sql).
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- The privacy contract under test:
--   * live_locations is owner-only and every coordinate is coarsened before
--     persistence, including writes made directly through PostgREST.
--   * find_nearby_people is MUTUAL — it returns nothing to a caller who isn't
--     sharing — and it honours blocks, the 'connections' visibility scope, and
--     the radius. Coordinates it returns are coarsened.
--
-- Convention (mirrors moderation.test.sql): seed as the privileged migration
-- role, then switch to `authenticated` with a specific user's JWT claims.

begin;
select plan(16);

-- ————————————————————————— fixtures —————————————————————————
-- Ava (caller), Ben (nearby sharer), Cara (blocked by Ava), Dan
-- (connections-only, NOT connected), Eve (connections-only, connected to Ava),
-- Finn (far away), Gil (not sharing at all).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ava@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'cara@example.com'),
  ('00000000-0000-0000-0000-0000000000d4', 'dan@example.com'),
  ('00000000-0000-0000-0000-0000000000e5', 'eve@example.com'),
  ('00000000-0000-0000-0000-0000000000f6', 'finn@example.com'),
  ('00000000-0000-0000-0000-0000000000a7', 'gil@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ava', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Ben', true),
  ('00000000-0000-0000-0000-0000000000c3', 'Cara', true),
  ('00000000-0000-0000-0000-0000000000d4', 'Dan', true),
  ('00000000-0000-0000-0000-0000000000e5', 'Eve', true),
  ('00000000-0000-0000-0000-0000000000f6', 'Finn', true),
  ('00000000-0000-0000-0000-0000000000a7', 'Gil', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Everyone but Gil is sharing, all expiring safely in the future. Ava/Ben/Cara/
-- Dan/Eve cluster near downtown Denver (a few hundred metres apart); Finn is in
-- New York City (~2,500 km away).
insert into public.live_locations (user_id, latitude, longitude, visibility, expires_at) values
  ('00000000-0000-0000-0000-0000000000a1', 39.7392, -104.9903, 'sharers', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000b2', 39.74036, -104.99012, 'sharers', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000c3', 39.7395, -104.9905, 'sharers', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000d4', 39.7398, -104.9902, 'connections', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000e5', 39.7399, -104.9901, 'connections', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000f6', 40.7128, -74.0060, 'sharers', now() + interval '2 hours');

-- Ava blocks Cara.
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c3');

-- Ava and Eve are accepted connections.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', 'accepted');

set local role authenticated;

-- ————————————————————————— act as Ava —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.live_locations),
  1,
  'RLS: a user sees only their own live_locations row'
);

select is(
  (select count(*)::int from public.live_locations
   where user_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'RLS: a user cannot read another user''s coordinate through the table'
);

select is(
  (select latitude from public.live_locations
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  39.739::double precision,
  'the database coarsens latitude before storing it'
);

select is(
  (select longitude from public.live_locations
    where user_id = '00000000-0000-0000-0000-0000000000a1'),
  -104.990::double precision,
  'the database coarsens longitude before storing it'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000)
   where user_id = '00000000-0000-0000-0000-0000000000b2'),
  1,
  'find_nearby_people surfaces a nearby sharer'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000)
   where user_id = '00000000-0000-0000-0000-0000000000c3'),
  0,
  'find_nearby_people excludes a blocked user'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000)
   where user_id = '00000000-0000-0000-0000-0000000000d4'),
  0,
  'find_nearby_people hides a connections-only user who is not a connection'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000)
   where user_id = '00000000-0000-0000-0000-0000000000e5'),
  1,
  'find_nearby_people shows a connections-only user who IS a connection'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000)
   where user_id = '00000000-0000-0000-0000-0000000000f6'),
  0,
  'find_nearby_people excludes someone outside the radius'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000000)
   where user_id = '00000000-0000-0000-0000-0000000000f6'),
  1,
  'find_nearby_people includes the far user once the radius is wide enough'
);

select is(
  (select count(*)::int from public.find_nearby_people(5000)),
  2,
  'within 5 km Ava sees exactly Ben and Eve (Cara blocked, Dan not a connection, Finn far)'
);

-- The RPC returns the coarse point stored at write, never Ben's raw fix.
select ok(
  (select latitude from public.find_nearby_people(5000)
     where user_id = '00000000-0000-0000-0000-0000000000b2')
    = round(39.74036::numeric, 3)::double precision
  and (select latitude from public.find_nearby_people(5000)
         where user_id = '00000000-0000-0000-0000-0000000000b2')
    <> 39.74036::double precision,
  'find_nearby_people returns the stored coarse latitude, not the raw fix'
);

-- Moving the caller inside the same rounded grid cell must not change the
-- returned distance. If distance uses either raw endpoint, repeated spoofed
-- caller positions turn it into a trilateration oracle for the target's raw
-- coordinate even though the latitude/longitude columns look coarsened.
create temporary table coarse_distance_before on commit drop as
select distance_m
  from public.find_nearby_people(5000)
 where user_id = '00000000-0000-0000-0000-0000000000b2';

reset role;
update public.live_locations
   set latitude = 39.73924,
       longitude = -104.99034
 where user_id = '00000000-0000-0000-0000-0000000000a1';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  (select distance_m
     from public.find_nearby_people(5000)
    where user_id = '00000000-0000-0000-0000-0000000000b2'),
  (select distance_m from coarse_distance_before),
  'raw caller positions in one rounded cell produce identical distance_m values'
);

-- ————————————————————————— act as Gil (not sharing) —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a7","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.find_nearby_people(50000)),
  0,
  'find_nearby_people returns nothing to a caller who is not sharing (mutual)'
);

-- ————————————————————————— act as Ben (see and be seen) —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.find_nearby_people(5000)
   where user_id = '00000000-0000-0000-0000-0000000000a1'),
  1,
  'the visibility is symmetric: Ben, who is sharing, sees Ava'
);

-- ————————————————————————— write-scope guard —————————————————————————
-- Ben (still the active JWT) cannot forge a row owned by Ava: the WITH CHECK
-- policy rejects it (SQLSTATE 42501, row-level security policy violation).
select throws_ok(
  $$ insert into public.live_locations (user_id, latitude, longitude, expires_at)
     values ('00000000-0000-0000-0000-0000000000a1', 1, 1, now() + interval '1 hour') $$,
  '42501',
  null,
  'a user cannot insert a live_locations row owned by someone else'
);

select * from finish();
rollback;
