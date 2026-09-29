-- pgTAP coverage for 20260930041000_shared_moments_distance.sql (P11, D11).
--
-- Outside zones, two located check-ins match within about 200 m whatever each
-- person typed, and not at 1 km even with the same name. Unlocated check-ins
-- fall back to the typed name. Inside a zone, the zone is the place. Blocks,
-- zone boundaries and anonymity hold throughout.

begin;
select plan(9);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000801a', 'sm-alice@example.com'),
  ('00000000-0000-0000-0000-00000000802b', 'sm-near@example.com'),
  ('00000000-0000-0000-0000-00000000803c', 'sm-far@example.com'),
  ('00000000-0000-0000-0000-00000000804d', 'sm-unlocated@example.com'),
  ('00000000-0000-0000-0000-00000000805e', 'sm-elsewhere@example.com'),
  ('00000000-0000-0000-0000-00000000806f', 'sm-zoned@example.com'),
  ('00000000-0000-0000-0000-000000008070', 'sm-blocked@example.com'),
  ('00000000-0000-0000-0000-000000008081', 'sm-hall-a@example.com'),
  ('00000000-0000-0000-0000-000000008092', 'sm-hall-b@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000801a', 'SM Alice', true),
  ('00000000-0000-0000-0000-00000000802b', 'SM Near', true),
  ('00000000-0000-0000-0000-00000000803c', 'SM Far', true),
  ('00000000-0000-0000-0000-00000000804d', 'SM Unlocated', true),
  ('00000000-0000-0000-0000-00000000805e', 'SM Elsewhere', true),
  ('00000000-0000-0000-0000-00000000806f', 'SM Zoned', true),
  ('00000000-0000-0000-0000-000000008070', 'SM Blocked', true),
  ('00000000-0000-0000-0000-000000008081', 'SM Hall A', true),
  ('00000000-0000-0000-0000-000000008092', 'SM Hall B', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.zones (id, slug, name, organizer_id, visibility) values
  ('00000000-0000-0000-0000-0000000f0801'::uuid, 'sm-expo', 'Expo',
   '00000000-0000-0000-0000-00000000801a', 'public');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000801a', '00000000-0000-0000-0000-000000008070');

insert into public.moments
  (id, user_id, zone_id, place_name, headline, latitude, longitude, status, available_until)
values
  -- Alice, located, at a café.
  ('00000000-0000-0000-0000-0000000d0801'::uuid, '00000000-0000-0000-0000-00000000801a', null,
   'Café Luna', 'Alice headline', 39.7392, -104.9903, 'open', now() + interval '2 hours'),
  -- About 140 m away on rounded points, and spelled differently.
  ('00000000-0000-0000-0000-0000000d0802'::uuid, '00000000-0000-0000-0000-00000000802b', null,
   'Cafe Luna 5th St', 'Near headline', 39.7400, -104.9910, 'open', now() + interval '2 hours'),
  -- The same name, about 1 km north.
  ('00000000-0000-0000-0000-0000000d0803'::uuid, '00000000-0000-0000-0000-00000000803c', null,
   'Café Luna', 'Far headline', 39.7482, -104.9903, 'open', now() + interval '2 hours'),
  -- The same name, no location.
  ('00000000-0000-0000-0000-0000000d0804'::uuid, '00000000-0000-0000-0000-00000000804d', null,
   'Café Luna', 'Unlocated headline', null, null, 'open', now() + interval '2 hours'),
  -- Another name, no location.
  ('00000000-0000-0000-0000-0000000d0805'::uuid, '00000000-0000-0000-0000-00000000805e', null,
   'Somewhere Else', null, null, null, 'open', now() + interval '2 hours'),
  -- Right next to Alice, but checked into a zone.
  ('00000000-0000-0000-0000-0000000d0806'::uuid, '00000000-0000-0000-0000-00000000806f',
   '00000000-0000-0000-0000-0000000f0801'::uuid,
   'Expo', null, 39.7392, -104.9903, 'open', now() + interval '2 hours'),
  -- Right next to Alice, and blocked by her.
  ('00000000-0000-0000-0000-0000000d0807'::uuid, '00000000-0000-0000-0000-000000008070', null,
   'Café Luna', null, 39.7392, -104.9903, 'open', now() + interval '2 hours'),
  -- Two people in the same zone who typed different things.
  ('00000000-0000-0000-0000-0000000d0808'::uuid, '00000000-0000-0000-0000-000000008081',
   '00000000-0000-0000-0000-0000000f0801'::uuid,
   'Hall A', null, null, null, 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000d0809'::uuid, '00000000-0000-0000-0000-000000008092',
   '00000000-0000-0000-0000-0000000f0801'::uuid,
   'Main Hall', null, 12.0, 12.0, 'open', now() + interval '2 hours');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000801a","role":"authenticated"}', true);

select ok(
  exists (select 1 from public.find_shared_moments('Café Luna')
           where id = '00000000-0000-0000-0000-0000000d0802'::uuid),
  'someone within 200 m matches, however they spelled the place'
);

select ok(
  not exists (select 1 from public.find_shared_moments('Café Luna')
               where id = '00000000-0000-0000-0000-0000000d0803'::uuid),
  'someone 1 km away does not match, even with the same name'
);

select ok(
  exists (select 1 from public.find_shared_moments('Café Luna')
           where id = '00000000-0000-0000-0000-0000000d0804'::uuid),
  'with no location to compare, the typed name still matches'
);

select ok(
  not exists (select 1 from public.find_shared_moments('Café Luna')
               where id = '00000000-0000-0000-0000-0000000d0805'::uuid),
  'an unlocated check-in under another name does not match'
);

select ok(
  not exists (select 1 from public.find_shared_moments('Café Luna')
               where id = '00000000-0000-0000-0000-0000000d0806'::uuid),
  'a zone check-in never matches one outside the zone, however close'
);

select ok(
  not exists (select 1 from public.find_shared_moments('Café Luna')
               where id = '00000000-0000-0000-0000-0000000d0807'::uuid),
  'a blocked person never matches, however close'
);

select is(
  (select count(*)::int from public.find_shared_moments('Café Luna')
    where headline is not null),
  0,
  'discovery stays anonymous: no headline before mutual curiosity'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000008081","role":"authenticated"}', true);

select ok(
  exists (select 1 from public.find_shared_moments('Hall A')
           where id = '00000000-0000-0000-0000-0000000d0809'::uuid),
  'inside a zone, the zone is the place: different names and locations still match'
);

select is(
  (select count(*)::int from public.find_shared_moments('Hall A')),
  2,
  'and only the people in that zone match'
);

select * from finish();
rollback;
