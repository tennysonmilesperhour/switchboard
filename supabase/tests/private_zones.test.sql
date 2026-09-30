-- pgTAP tests for private zones (20260812120000_private_zones.sql).
--
-- The point of the migration is that privacy lives in RLS, so every zone
-- surface inherits it without being told. These tests therefore exercise the
-- policies and definer functions directly, as the users would.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db

begin;
select plan(12);

-- ————————————————————————— fixtures —————————————————————————
-- olivia organizes both zones. member is invited to the private one.
-- stranger is never part of it and must never see it.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000201a', 'olivia@example.com'),
  ('00000000-0000-0000-0000-00000000202b', 'member@example.com'),
  ('00000000-0000-0000-0000-00000000203c', 'stranger@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000201a', 'Olivia', true),
  ('00000000-0000-0000-0000-00000000202b', 'Member', true),
  ('00000000-0000-0000-0000-00000000203c', 'Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.zones (id, slug, name, organizer_id, visibility) values
  ('00000000-0000-0000-0000-0000000f0001'::uuid, 'open-conf', 'Open Conference',
   '00000000-0000-0000-0000-00000000201a', 'public'),
  ('00000000-0000-0000-0000-0000000f0002'::uuid, 'family-trip', 'Family Trip',
   '00000000-0000-0000-0000-00000000201a', 'private');

insert into public.zone_members (zone_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000f0002'::uuid,
   '00000000-0000-0000-0000-00000000202b', 'member');

-- ————————————————————————— as the stranger —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000203c","role":"authenticated"}', true);

-- The public zone is still world-readable: serendipity at a conference or a
-- festival is the original use case and must keep working.
select is(
  (select count(*)::int from public.zones where slug = 'open-conf'),
  1,
  'a stranger can still read a public zone'
);

-- The private one does not exist as far as they are concerned. This single
-- assertion is what also hides it from /zones, the map layer, and any future
-- reader, because they all query this table through RLS.
select is(
  (select count(*)::int from public.zones where slug = 'family-trip'),
  0,
  'a stranger cannot read a private zone'
);

select ok(
  not public.can_current_user_view_zone(
    '00000000-0000-0000-0000-0000000f0002'::uuid
  ),
  'can_view_zone denies a non-member on a private zone'
);

-- The roster is not a way around the zone being hidden.
select is(
  (select count(*)::int from public.zone_members
    where zone_id = '00000000-0000-0000-0000-0000000f0002'::uuid),
  0,
  'a stranger cannot read a private zone roster'
);

-- Nor is checking in: a moment carrying a private zone_id would otherwise show
-- up in that zone's presence count, which is the one number that crosses the
-- member boundary.
select throws_ok(
  $$ insert into public.moments (user_id, place_name, zone_id, status, available_until)
     values ('00000000-0000-0000-0000-00000000203c', 'Lobby',
             '00000000-0000-0000-0000-0000000f0002'::uuid, 'open', now() + interval '2 hours') $$,
  'cannot check into a zone you are not part of',
  'a stranger cannot check into a private zone'
);

-- Membership is never self-writable. This one is refused by RLS rather than by
-- a raise, so it is asserted on the SQLSTATE (42501, insufficient_privilege)
-- like the other policy denials in this suite's siblings — the message text
-- belongs to Postgres and naming it here would make the test brittle.
select throws_ok(
  $$ insert into public.zone_members (zone_id, member_id, role)
     values ('00000000-0000-0000-0000-0000000f0002'::uuid,
             '00000000-0000-0000-0000-00000000203c', 'moderator') $$,
  '42501',
  null,
  'a stranger cannot add themselves to a private zone'
);

-- Neither is minting a link to one.
select throws_ok(
  $$ select public.ensure_zone_invite_code('00000000-0000-0000-0000-0000000f0002'::uuid) $$,
  'not a moderator of this zone',
  'a non-moderator cannot mint a zone invite code'
);

-- A request is the one thing they may write, and only as themselves. Since
-- 20260930040000_private_zone_requests.sql it goes through request_zone_join,
-- which also decides whether a past decision still stands.
select * from public.request_zone_join(
  '00000000-0000-0000-0000-0000000f0002'::uuid, 'I am on this trip');
select is(
  (select status from public.zone_join_requests
    where requester_id = '00000000-0000-0000-0000-00000000203c'),
  'pending',
  'a stranger may file a join request, which starts pending'
);

-- ...but cannot approve their own.
select throws_ok(
  $$ select public.resolve_zone_join_request(
       (select id from public.zone_join_requests
         where requester_id = '00000000-0000-0000-0000-00000000203c'), true) $$,
  'not a moderator of this zone',
  'a requester cannot approve their own join request'
);

-- ————————————————————————— as the member —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000202b","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.zones where slug = 'family-trip'),
  1,
  'an invited member can read the private zone'
);

-- A member is not a moderator: they cannot hand out the capability link.
select throws_ok(
  $$ select public.ensure_zone_invite_code('00000000-0000-0000-0000-0000000f0002'::uuid) $$,
  'not a moderator of this zone',
  'a plain member cannot mint a zone invite code'
);

-- ————————————————————————— as the organizer —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000201a","role":"authenticated"}', true);

-- The organizer cannot hand the zone to someone else by rewriting ownership.
select throws_ok(
  $$ update public.zones
       set organizer_id = '00000000-0000-0000-0000-00000000203c'
     where slug = 'family-trip' $$,
  'zone organizer is immutable',
  'zone ownership is frozen'
);

select * from finish();
rollback;
