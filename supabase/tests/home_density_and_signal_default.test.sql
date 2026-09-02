-- Density gating and the remembered signal audience.
--
-- The density RPC may reveal one boolean and no more. Exact home coordinates
-- remain owner-only, while blocks, zone membership, live-share visibility, and
-- the 50 km city radius are enforced inside the database.

begin;
select plan(28);

-- ————————————————————————— API privileges —————————————————————————
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'home_latitude', 'SELECT'),
  'exact home latitude is withheld from the profiles API'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'home_longitude', 'SELECT'),
  'exact home longitude is withheld from the profiles API'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'last_signal_circle_id', 'SELECT'),
  'the remembered signal circle is withheld from the profiles API'
);
select ok(
  not has_function_privilege('anon', 'public.home_around_available()', 'EXECUTE'),
  'anonymous callers cannot ask for Home density'
);
select ok(
  not has_function_privilege('anon', 'public.my_home_point()', 'EXECUTE'),
  'anonymous callers cannot read a home point'
);
select ok(
  not has_function_privilege('anon', 'public.my_signal_default_circle()', 'EXECUTE'),
  'anonymous callers cannot read a signal preference'
);
select ok(
  not has_function_privilege(
    'anon', 'public.set_my_signal_default_circle(uuid)', 'EXECUTE'
  ),
  'anonymous callers cannot write a signal preference'
);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d000', 'density-none@example.com'),
  ('00000000-0000-0000-0000-00000000d001', 'density-denver@example.com'),
  ('00000000-0000-0000-0000-00000000d002', 'density-london@example.com'),
  ('00000000-0000-0000-0000-00000000d003', 'density-tokyo-stranger@example.com'),
  ('00000000-0000-0000-0000-00000000d004', 'density-tokyo-member@example.com'),
  ('00000000-0000-0000-0000-00000000d005', 'density-sydney@example.com'),
  ('00000000-0000-0000-0000-00000000e005', 'density-sydney-sharer@example.com'),
  ('00000000-0000-0000-0000-00000000d006', 'density-honolulu@example.com'),
  ('00000000-0000-0000-0000-00000000e006', 'density-honolulu-expired@example.com'),
  ('00000000-0000-0000-0000-00000000d007', 'density-anchorage@example.com'),
  ('00000000-0000-0000-0000-00000000e007', 'density-anchorage-blocked@example.com'),
  ('00000000-0000-0000-0000-00000000d008', 'density-cape-town@example.com'),
  ('00000000-0000-0000-0000-00000000e008', 'density-cape-town-private@example.com'),
  ('00000000-0000-0000-0000-00000000d009', 'density-buenos-aires@example.com'),
  ('00000000-0000-0000-0000-00000000e009', 'density-buenos-aires-friend@example.com'),
  ('00000000-0000-0000-0000-00000000d010', 'density-zone-owner@example.com'),
  ('00000000-0000-0000-0000-00000000d011', 'density-boulder@example.com'),
  ('00000000-0000-0000-0000-00000000e011', 'density-boulder-sharer@example.com');

insert into public.profiles (
  id, display_name, onboarded, home_latitude, home_longitude
) values
  ('00000000-0000-0000-0000-00000000d000', 'No Point', true, null, null),
  ('00000000-0000-0000-0000-00000000d001', 'Denver', true, 39.7392, -104.9903),
  ('00000000-0000-0000-0000-00000000d002', 'London', true, 51.5074, -0.1278),
  ('00000000-0000-0000-0000-00000000d003', 'Tokyo Stranger', true, 35.6762, 139.6503),
  ('00000000-0000-0000-0000-00000000d004', 'Tokyo Member', true, 35.6762, 139.6503),
  ('00000000-0000-0000-0000-00000000d005', 'Sydney', true, -33.8688, 151.2093),
  ('00000000-0000-0000-0000-00000000e005', 'Sydney Sharer', true, null, null),
  ('00000000-0000-0000-0000-00000000d006', 'Honolulu', true, 21.3069, -157.8583),
  ('00000000-0000-0000-0000-00000000e006', 'Expired Sharer', true, null, null),
  ('00000000-0000-0000-0000-00000000d007', 'Anchorage', true, 61.2181, -149.9003),
  ('00000000-0000-0000-0000-00000000e007', 'Blocked Sharer', true, null, null),
  ('00000000-0000-0000-0000-00000000d008', 'Cape Town', true, -33.9249, 18.4241),
  ('00000000-0000-0000-0000-00000000e008', 'Private Sharer', true, null, null),
  ('00000000-0000-0000-0000-00000000d009', 'Buenos Aires', true, -34.6037, -58.3816),
  ('00000000-0000-0000-0000-00000000e009', 'Connected Sharer', true, null, null),
  ('00000000-0000-0000-0000-00000000d010', 'Zone Owner', true, null, null),
  -- Exactly 51.1 km due south of the Boulder sharer below: outside an exact
  -- 50 km circle, inside the same coarse neighbourhood.
  ('00000000-0000-0000-0000-00000000d011', 'Boulder', true, 39.90, -105.00),
  ('00000000-0000-0000-0000-00000000e011', 'Boulder Sharer', true, null, null)
on conflict (id) do update set
  display_name = excluded.display_name,
  onboarded = excluded.onboarded,
  home_latitude = excluded.home_latitude,
  home_longitude = excluded.home_longitude;

insert into public.zones (
  id, slug, name, organizer_id, visibility, latitude, longitude
) values
  ('00000000-0000-0000-0000-00000000f001', 'density-denver', 'Denver Zone',
   '00000000-0000-0000-0000-00000000d010', 'public', 39.7400, -104.9900),
  ('00000000-0000-0000-0000-00000000f002', 'density-tokyo', 'Tokyo Private Zone',
   '00000000-0000-0000-0000-00000000d010', 'private', 35.6770, 139.6510);

insert into public.zone_members (zone_id, member_id, role) values
  ('00000000-0000-0000-0000-00000000f002',
   '00000000-0000-0000-0000-00000000d004', 'member');

insert into public.live_locations (
  user_id, latitude, longitude, visibility, expires_at
) values
  ('00000000-0000-0000-0000-00000000e005', -33.8690, 151.2100,
   'sharers', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e006', 21.3072, -157.8580,
   'sharers', now() - interval '1 minute'),
  ('00000000-0000-0000-0000-00000000e007', 61.2185, -149.9000,
   'sharers', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e008', -33.9252, 18.4245,
   'connections', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e009', -34.6040, -58.3820,
   'connections', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000e011', 40.36, -105.00,
   'sharers', now() + interval '2 hours');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000d007',
   '00000000-0000-0000-0000-00000000e007');

insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000d009',
   '00000000-0000-0000-0000-00000000e009', 'accepted');

insert into public.circles (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000c101',
   '00000000-0000-0000-0000-00000000d001', 'Denver Friends'),
  ('00000000-0000-0000-0000-00000000c202',
   '00000000-0000-0000-0000-00000000d002', 'London Friends');

set local role authenticated;

-- ————————————————————————— density cases —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d000","role":"authenticated"}', true);
select is(public.home_around_available(), false,
  'a viewer without a home point never gets the Around pillar');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d002","role":"authenticated"}', true);
select is(public.home_around_available(), false,
  'an anchored zone in another city does not create local density');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);
select is(public.home_around_available(), true,
  'a nearby public anchored zone creates local density');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d003","role":"authenticated"}', true);
select is(public.home_around_available(), false,
  'a nearby private zone is invisible to a non-member');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d004","role":"authenticated"}', true);
select is(public.home_around_available(), true,
  'a nearby private zone creates density for its member');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d005","role":"authenticated"}', true);
select is(public.home_around_available(), true,
  'a nearby active sharer creates local density');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d006","role":"authenticated"}', true);
select is(public.home_around_available(), false,
  'an expired share does not create local density');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d007","role":"authenticated"}', true);
select is(public.home_around_available(), false,
  'a blocked sharer does not create local density');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d008","role":"authenticated"}', true);
select is(public.home_around_available(), false,
  'a connections-only share stays hidden from a non-connection');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d009","role":"authenticated"}', true);
select is(public.home_around_available(), true,
  'a connections-only share creates density for a connection');

-- The oracle guard. A caller controls their own home point and may call this as
-- often as they like, so the answer must be a function of the point's coarse
-- cell, not of its exact position: an exact 50 km edge would let a caller walk
-- the boundary and trilaterate a sharer's raw coordinate. The Boulder viewer is
-- 51.1 km from the sharer by exact haversine (which would say false) and 27.8 km
-- by coarse cell; moving 22 km closer, still inside the same cell, changes
-- nothing.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d011","role":"authenticated"}', true);
select is(public.home_around_available(), true,
  'density is decided between coarse cells, not at an exact 50 km edge');
update public.profiles set home_latitude = 40.10, home_longitude = -105.00
  where id = '00000000-0000-0000-0000-00000000d011';
select is(public.home_around_available(), true,
  'moving the home point inside its coarse cell never changes the answer');

select is(
  pg_typeof(public.home_around_available())::text,
  'boolean',
  'the density boundary returns a boolean and no cross-user row'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);
select ok(
  (select latitude = 39.7392 and longitude = -104.9903
   from public.my_home_point()),
  'the owner can retrieve their exact point through the narrow accessor'
);

-- ————————————————————————— coordinate integrity —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d000","role":"authenticated"}', true);
select throws_ok(
  $$ update public.profiles set home_latitude = 10, home_longitude = null
     where id = '00000000-0000-0000-0000-00000000d000' $$,
  '23514', null,
  'a half-coordinate is rejected'
);
select throws_ok(
  $$ update public.profiles set home_latitude = 0, home_longitude = 0
     where id = '00000000-0000-0000-0000-00000000d000' $$,
  '23514', null,
  'null island is rejected as a failed geocode'
);

-- ————————————————————————— remembered signal circle —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_my_signal_default_circle(
       '00000000-0000-0000-0000-00000000c202'::uuid) $$,
  'signal default must be one of your circles',
  'the setter rejects another owner''s circle'
);
select throws_ok(
  $$ update public.profiles
     set last_signal_circle_id = '00000000-0000-0000-0000-00000000c202'::uuid
     where id = '00000000-0000-0000-0000-00000000d001' $$,
  'signal default must be one of your circles',
  'the trigger rejects a forged preference through direct table access'
);
select lives_ok(
  $$ select public.set_my_signal_default_circle(
       '00000000-0000-0000-0000-00000000c101'::uuid) $$,
  'the setter accepts one of the caller''s circles'
);
select is(
  public.my_signal_default_circle(),
  '00000000-0000-0000-0000-00000000c101'::uuid,
  'the owner reads the remembered circle through the narrow accessor'
);

delete from public.circles
where id = '00000000-0000-0000-0000-00000000c101';
select is(
  public.my_signal_default_circle(),
  null::uuid,
  'deleting the remembered circle clears the preference'
);

select * from finish();
rollback;
