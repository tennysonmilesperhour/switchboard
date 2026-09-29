-- pgTAP coverage for 20260929160000_private_place_leaks.sql.
--
-- Each fix gets a refusal and a positive control, so the suite fails if a
-- later migration over-restricts as well as if it reopens the leak.

begin;
select plan(8);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000501a', 'organizer5@example.com'),
  ('00000000-0000-0000-0000-00000000502b', 'member-a@example.com'),
  ('00000000-0000-0000-0000-00000000503c', 'member-b@example.com'),
  ('00000000-0000-0000-0000-00000000504d', 'outsider@example.com'),
  ('00000000-0000-0000-0000-00000000505e', 'city-one@example.com'),
  ('00000000-0000-0000-0000-00000000506f', 'city-two@example.com'),
  ('00000000-0000-0000-0000-000000005070', 'venue-owner@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000501a', 'Organizer', true),
  ('00000000-0000-0000-0000-00000000502b', 'Member A', true),
  ('00000000-0000-0000-0000-00000000503c', 'Member B', true),
  ('00000000-0000-0000-0000-00000000504d', 'Outsider', true),
  ('00000000-0000-0000-0000-00000000505e', 'City One', true),
  ('00000000-0000-0000-0000-00000000506f', 'City Two', true),
  ('00000000-0000-0000-0000-000000005070', 'Venue Owner', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.zones (id, slug, name, organizer_id, visibility) values
  ('00000000-0000-0000-0000-0000000f0501'::uuid, 'lake-house', 'Lake House',
   '00000000-0000-0000-0000-00000000501a', 'private'),
  ('00000000-0000-0000-0000-0000000f0502'::uuid, 'main-stage-one', 'Main Stage',
   '00000000-0000-0000-0000-00000000501a', 'public'),
  ('00000000-0000-0000-0000-0000000f0503'::uuid, 'main-stage-two', 'Main Stage',
   '00000000-0000-0000-0000-00000000501a', 'public');

insert into public.zone_members (zone_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000f0501'::uuid, '00000000-0000-0000-0000-00000000502b', 'member'),
  ('00000000-0000-0000-0000-0000000f0501'::uuid, '00000000-0000-0000-0000-00000000503c', 'member');

insert into public.moments (user_id, zone_id, place_name, status, available_until) values
  -- Two members at the private zone.
  ('00000000-0000-0000-0000-00000000502b', '00000000-0000-0000-0000-0000000f0501'::uuid,
   'Lake House', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000503c', '00000000-0000-0000-0000-0000000f0501'::uuid,
   'Lake House', 'open', now() + interval '2 hours'),
  -- The outsider types the private zone's name without joining it.
  ('00000000-0000-0000-0000-00000000504d', null,
   'Lake House', 'open', now() + interval '2 hours'),
  -- Two public zones that share a name, in different places.
  ('00000000-0000-0000-0000-00000000505e', '00000000-0000-0000-0000-0000000f0502'::uuid,
   'Main Stage', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000506f', '00000000-0000-0000-0000-0000000f0503'::uuid,
   'Main Stage', 'open', now() + interval '2 hours');

insert into public.venues (id, name, area, perk, claimed_by, status, reviewed_by, reviewed_at) values
  ('00000000-0000-0000-0000-0000000e0501'::uuid, 'Corner Cafe', 'Downtown',
   '10% off for groups', '00000000-0000-0000-0000-000000005070', 'verified',
   '00000000-0000-0000-0000-00000000501a', now());

set local role authenticated;

-- ————————————————————————— zone headcount —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000504d","role":"authenticated"}', true);

select is(
  public.zone_presence('00000000-0000-0000-0000-0000000f0501'::uuid),
  0,
  'a non-member learns nothing about who is at a private zone'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000502b","role":"authenticated"}', true);

select is(
  public.zone_presence('00000000-0000-0000-0000-0000000f0501'::uuid),
  1,
  'a member still sees the other member checked in'
);

-- ————————————————————————— shared moments —————————————————————————
select is(
  (select count(*)::int from public.find_shared_moments('Lake House')),
  1,
  'a member matches the other member at the private zone, not the outsider'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000504d","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.find_shared_moments('Lake House')),
  0,
  'typing a private zone''s name does not match its members'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000505e","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.find_shared_moments('Main Stage')),
  0,
  'two zones that share a name do not match each other''s people'
);

-- ————————————————————————— verified venue edits —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000005070","role":"authenticated"}', true);

select lives_ok(
  $$ update public.venues set name = 'Famous Chain Coffee'
     where id = '00000000-0000-0000-0000-0000000e0501'::uuid $$,
  'the owner may still edit their venue'
);

reset role;

select is(
  (select status from public.venues where id = '00000000-0000-0000-0000-0000000e0501'::uuid),
  'pending',
  'renaming a verified venue sends it back to review'
);

select is(
  (select reviewed_at from public.venues where id = '00000000-0000-0000-0000-0000000e0501'::uuid),
  null::timestamptz,
  'and clears the earlier review'
);

select * from finish();
rollback;
