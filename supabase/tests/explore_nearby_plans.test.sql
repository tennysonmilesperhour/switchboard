begin;
select plan(11);

-- Four people: a viewer (v), a stranger host near v (h), a far host (f), and a
-- blocked host (b). Coordinates sit on one 0.25 degree grid cell for v and h,
-- the next cell over for f.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'v@example.test'),
  ('00000000-0000-0000-0000-0000000000a2', 'h@example.test'),
  ('00000000-0000-0000-0000-0000000000a3', 'f@example.test'),
  ('00000000-0000-0000-0000-0000000000a4', 'b@example.test');

insert into public.profiles (
  id, display_name, onboarded, discoverable, discovery_geography,
  home_latitude, home_longitude
) values
  ('00000000-0000-0000-0000-0000000000a1', 'Viewer', true, true, true, 40.00, -100.00),
  ('00000000-0000-0000-0000-0000000000a2', 'Near host', true, true, true, 40.01, -100.01),
  ('00000000-0000-0000-0000-0000000000a3', 'Far host', true, true, true, 40.50, -100.00),
  ('00000000-0000-0000-0000-0000000000a4', 'Blocked host', true, false, false, 40.01, -100.01)
on conflict (id) do update set
  display_name = excluded.display_name,
  onboarded = excluded.onboarded,
  discoverable = excluded.discoverable,
  discovery_geography = excluded.discovery_geography,
  home_latitude = excluded.home_latitude,
  home_longitude = excluded.home_longitude;

insert into public.events (id, host_id, title, status, capacity, open_table, broadcast_nearby, starts_at) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', 'Near broadcast', 'inviting', 6, true, true, now() + interval '2 days'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000a2', 'Near private', 'inviting', 6, true, false, now() + interval '2 days'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000a3', 'Far broadcast', 'inviting', 6, true, true, now() + interval '2 days'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000a4', 'Blocked broadcast', 'inviting', 6, true, true, now() + interval '2 days');

-- Broadcast is never allowed without an Open Table.
select throws_ok(
  $$ insert into public.events (host_id, title, status, capacity, open_table, broadcast_nearby)
     values ('00000000-0000-0000-0000-0000000000a2', 'Bad', 'inviting', 6, false, true) $$,
  '23514', null, 'broadcast without open table is refused');

insert into public.profile_blocks (blocker_id, blocked_id)
values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a4');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  (select array_agg(title order by title) from public.list_nearby_plans(100)),
  array['Far broadcast', 'Near broadcast'],
  'a stranger sees broadcast plans in range, not private or blocked ones');
select is(
  (select array_agg(title) from public.list_nearby_plans(50)),
  array['Near broadcast'],
  'a narrower range drops the farther plan');
select is(
  (select distance_band from public.list_nearby_plans(100) where title = 'Near broadcast'),
  'area', 'same grid cell reads as area');
select is(
  (select distance_band from public.list_nearby_plans(100) where title = 'Far broadcast'),
  'nearby', 'the next cell over reads as nearby');
select is(
  (select count(*)::int from public.list_nearby_plans(100) where title = 'Near private'),
  0, 'a plan that is not broadcast never appears');

-- A blocked host cannot be asked to join either.
select throws_ok(
  $$ select public.request_to_join('00000000-0000-0000-0000-0000000000e4') $$,
  null, 'event is not open', 'asking a blocked host is refused');
select lives_ok(
  $$ select public.request_to_join('00000000-0000-0000-0000-0000000000e1') $$,
  'asking a visible host works');

select is(
  (select distance_band from public.list_people_distance_bands()
   where person_id = '00000000-0000-0000-0000-0000000000a2'),
  'area', 'a discoverable neighbour is banded');
select is(
  (select count(*)::int from public.list_people_distance_bands()
   where person_id = '00000000-0000-0000-0000-0000000000a4'),
  0, 'a blocked person is never banded');

-- Anonymous callers get nothing.
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.list_nearby_plans(50) $$,
  '42501', null, 'anon cannot call list_nearby_plans');

select * from finish();
rollback;
