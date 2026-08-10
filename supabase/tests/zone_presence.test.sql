-- pgTAP tests for zone presence (20260810120000_zone_presence.sql).
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- The contract under test:
--   * `moments` stays owner-only under RLS — zone_presence must not become a
--     back door onto another person's check-in row.
--   * zone_presence counts OTHER people who are open in THIS zone right now:
--     never the caller, never an expired or closed check-in, never a blocked
--     user, never another zone's.
--   * anon can execute neither the wrapper nor the private body.
--
-- Convention (mirrors live_location.test.sql): seed as the privileged migration
-- role, then switch to `authenticated` with a specific user's JWT claims.

begin;
select plan(11);

-- ————————————————————————— fixtures —————————————————————————
-- Ava (the caller), Ben and Cara (checked into the same zone as her), Dan
-- (blocked by Ava), Eve (an expired check-in and a closed one), Finn (a
-- different zone).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'ava.zone@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'ben.zone@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'cara.zone@example.com'),
  ('00000000-0000-0000-0000-0000000000d4', 'dan.zone@example.com'),
  ('00000000-0000-0000-0000-0000000000e5', 'eve.zone@example.com'),
  ('00000000-0000-0000-0000-0000000000f6', 'finn.zone@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ava', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Ben', true),
  ('00000000-0000-0000-0000-0000000000c3', 'Cara', true),
  ('00000000-0000-0000-0000-0000000000d4', 'Dan', true),
  ('00000000-0000-0000-0000-0000000000e5', 'Eve', true),
  ('00000000-0000-0000-0000-0000000000f6', 'Finn', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Six zones, each isolating one fact the count has to get right.
insert into public.zones (id, slug, name, organizer_id) values
  ('11111111-1111-1111-1111-111111111111', 'zone-mixed', 'Mixed', '00000000-0000-0000-0000-0000000000a1'),
  ('22222222-2222-2222-2222-222222222222', 'zone-other', 'Other', '00000000-0000-0000-0000-0000000000a1'),
  ('33333333-3333-3333-3333-333333333333', 'zone-blocked', 'Blocked', '00000000-0000-0000-0000-0000000000a1'),
  ('44444444-4444-4444-4444-444444444444', 'zone-expired', 'Expired', '00000000-0000-0000-0000-0000000000a1'),
  ('55555555-5555-5555-5555-555555555555', 'zone-closed', 'Closed', '00000000-0000-0000-0000-0000000000a1'),
  ('66666666-6666-6666-6666-666666666666', 'zone-empty', 'Empty', '00000000-0000-0000-0000-0000000000a1');

insert into public.moments (user_id, zone_id, place_name, status, available_until) values
  -- Mixed zone: Ava herself plus two other live check-ins.
  ('00000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'Mixed', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'Mixed', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000c3', '11111111-1111-1111-1111-111111111111', 'Mixed', 'open', now() + interval '2 hours'),
  -- A live check-in in a different zone.
  ('00000000-0000-0000-0000-0000000000f6', '22222222-2222-2222-2222-222222222222', 'Other', 'open', now() + interval '2 hours'),
  -- Blocked, expired, and closed check-ins, each alone in its own zone.
  ('00000000-0000-0000-0000-0000000000d4', '33333333-3333-3333-3333-333333333333', 'Blocked', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000e5', '44444444-4444-4444-4444-444444444444', 'Expired', 'open', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000e5', '55555555-5555-5555-5555-555555555555', 'Closed', 'closed', now() + interval '2 hours');

-- Ava blocks Dan.
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000d4');

set local role authenticated;

-- ————————————————————————— act as Ava —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.moments),
  1,
  'RLS: a user still sees only their own moments'
);

select is(
  (select count(*)::int from public.moments
   where user_id = '00000000-0000-0000-0000-0000000000b2'),
  0,
  'RLS: zone presence does not open a path to another user''s check-in row'
);

select is(
  public.zone_presence('11111111-1111-1111-1111-111111111111'),
  2,
  'zone_presence counts the other people in the zone, never the caller'
);

select is(
  public.zone_presence('22222222-2222-2222-2222-222222222222'),
  1,
  'zone_presence is scoped to its own zone'
);

select is(
  public.zone_presence('33333333-3333-3333-3333-333333333333'),
  0,
  'zone_presence does not count a blocked user'
);

select is(
  public.zone_presence('44444444-4444-4444-4444-444444444444'),
  0,
  'zone_presence does not count an expired check-in'
);

select is(
  public.zone_presence('55555555-5555-5555-5555-555555555555'),
  0,
  'zone_presence does not count a closed check-in'
);

select is(
  public.zone_presence('66666666-6666-6666-6666-666666666666'),
  0,
  'zone_presence returns 0 for a zone nobody is in'
);

-- ————————————————————————— act as Ben —————————————————————————
-- The count is relative to whoever is asking: Ben sees Ava and Cara.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);

select is(
  public.zone_presence('11111111-1111-1111-1111-111111111111'),
  2,
  'zone_presence excludes whoever is asking, not one fixed person'
);

-- Dan is blocked by Ava, not by Ben, so Ben still sees him.
select is(
  public.zone_presence('33333333-3333-3333-3333-333333333333'),
  1,
  'a block filters the blocker''s view only'
);

-- ————————————————————————— least privilege —————————————————————————
reset role;
select ok(
  not has_function_privilege('anon', 'public.zone_presence(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.zone_presence(uuid)', 'EXECUTE'),
  'anon can execute neither the zone_presence wrapper nor its private body'
);

select * from finish();
rollback;
