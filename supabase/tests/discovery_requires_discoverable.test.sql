-- pgTAP coverage for 20260930042000_discovery_requires_discoverable.sql (G5, D13).
--
-- Browsing people discovery requires being discoverable yourself; "Nearby"
-- compares where people are rather than whether they share a city name; and a
-- discovery interest needs the same standing, while withdrawing one never does.

begin;
select plan(9);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000901a', 'dd-viewer@example.com'),
  ('00000000-0000-0000-0000-00000000902b', 'dd-boulder@example.com'),
  ('00000000-0000-0000-0000-00000000903c', 'dd-tokyo@example.com');
insert into public.profiles (
  id, display_name, onboarded, discoverable, discovery_geography,
  location, home_latitude, home_longitude
) values
  ('00000000-0000-0000-0000-00000000901a', 'DD Viewer', true, false, true,
   'Denver, CO', 39.7392, -104.9903),
  ('00000000-0000-0000-0000-00000000902b', 'DD Boulder', true, true, true,
   'Boulder, CO', 40.0150, -105.2705),
  ('00000000-0000-0000-0000-00000000903c', 'DD Tokyo', true, true, true,
   'Tokyo', 35.6762, 139.6503)
on conflict (id) do update set
  display_name = excluded.display_name,
  onboarded = excluded.onboarded,
  discoverable = excluded.discoverable,
  discovery_geography = excluded.discovery_geography,
  location = excluded.location,
  home_latitude = excluded.home_latitude,
  home_longitude = excluded.home_longitude;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000901a","role":"authenticated"}', true);

-- ————————————————————————— see and be seen —————————————————————————
select is(
  (select count(*)::int from public.list_discoverable_people('all')),
  0,
  'someone who is not discoverable cannot browse discovery'
);

select throws_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-00000000901a',
             '00000000-0000-0000-0000-00000000902b', 'Hiking', 'discover_connect', 'active') $$,
  '42501',
  null,
  'nor mark interest in someone through discovery'
);

reset role;
update public.profiles set discoverable = true
 where id = '00000000-0000-0000-0000-00000000901a';
set local role authenticated;

select ok(
  exists (select 1 from public.list_discoverable_people('all')
           where id = '00000000-0000-0000-0000-00000000902b'),
  'once discoverable, they can browse'
);

-- ————————————————————————— nearby —————————————————————————
select ok(
  (select 'geography' = any(categories) from public.list_discoverable_people('all')
    where id = '00000000-0000-0000-0000-00000000902b'),
  'someone in the same area is nearby'
);

select ok(
  (select not ('geography' = any(categories)) from public.list_discoverable_people('all')
    where id = '00000000-0000-0000-0000-00000000903c'),
  'someone who shares their city but lives on another continent is not nearby'
);

select is(
  (select count(*)::int from public.list_discoverable_people('geography')),
  1,
  'the Nearby lane holds only the people who are near'
);

-- ————————————————————————— interest —————————————————————————
select lives_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-00000000901a',
             '00000000-0000-0000-0000-00000000902b', 'Hiking', 'discover_connect', 'active') $$,
  'a discoverable person can mark interest'
);

reset role;
update public.profiles set discoverable = false
 where id = '00000000-0000-0000-0000-00000000901a';
set local role authenticated;

select lives_ok(
  $$ update public.mutual_intents set status = 'withdrawn'
      where author_id = '00000000-0000-0000-0000-00000000901a'
        and kind = 'discover_connect' $$,
  'withdrawing an interest works even after turning discoverability off'
);

reset role;
update public.profiles set discoverable = true, sabbatical = true
 where id = '00000000-0000-0000-0000-00000000901a';
set local role authenticated;

select is(
  (select count(*)::int from public.list_discoverable_people('all')),
  0,
  'a sabbatical hides discovery from you as it hides you from discovery'
);

select * from finish();
rollback;
