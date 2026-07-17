-- pgTAP regression tests for the venue review lifecycle
-- (20260717220000_venue_review.sql).
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- Convention (mirrors moderation.test.sql): seed as the privileged migration
-- role, then switch to `authenticated` with a specific user's JWT claims to
-- exercise the policies, freeze trigger, and definer queue exactly as that user
-- would experience them.

begin;
select plan(10);

-- ————————————————————————— fixtures —————————————————————————
-- alice (claimant), bob (unrelated user), mod (appointed later).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a11ce', 'alice@example.com'),
  ('00000000-0000-0000-0000-0000000000b0', 'bob@example.com'),
  ('00000000-0000-0000-0000-00000000d0d0', 'mod@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000a11ce', 'Alice', true),
  ('00000000-0000-0000-0000-0000000000b0', 'Bob', true),
  ('00000000-0000-0000-0000-00000000d0d0', 'Mod', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- A genuine pending claim owned by alice.
insert into public.venues (id, name, area, perk, claimed_by, status) values
  ('00000000-0000-0000-0000-00000000f001', 'Joe Coffee', 'Downtown',
   '10% off for Switchboard groups', '00000000-0000-0000-0000-0000000a11ce', 'pending');

-- ————————————————————————— act as Alice (owner) —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a11ce","role":"authenticated"}', true);

-- The owner cannot self-verify: status is authority state on a row she can
-- UPDATE, and the freeze trigger is what stops her (RLS can't see OLD vs NEW).
select throws_ok(
  $$ update public.venues set status = 'verified'
     where id = '00000000-0000-0000-0000-00000000f001' $$,
  'P0001',
  'venue review state is moderator-only',
  'owner cannot self-verify their own pending venue'
);

-- The owner CAN still edit the descriptive fields of her pending claim.
select lives_ok(
  $$ update public.venues set perk = '15% off pitchers'
     where id = '00000000-0000-0000-0000-00000000f001' $$,
  'owner can edit non-authority fields on a pending venue'
);

-- A crafted insert cannot arrive pre-verified (WITH CHECK pins status=pending).
select throws_ok(
  $$ insert into public.venues (name, perk, claimed_by, status)
     values ('Self Verified', 'free drinks',
             '00000000-0000-0000-0000-0000000a11ce', 'verified') $$,
  '42501',
  'new row violates row-level security policy for table "venues"',
  'a claim cannot be inserted pre-verified'
);

-- A plain (pending) claim inserts fine.
select lives_ok(
  $$ insert into public.venues (name, perk, claimed_by)
     values ('Second Spot', 'free coffee refills',
             '00000000-0000-0000-0000-0000000a11ce') $$,
  'a pending claim inserts fine'
);

-- ————————————————————————— act as Bob (unrelated) —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

-- Bob cannot see anyone else's unreviewed claim.
select is(
  (select count(*)::int from public.venues
     where id = '00000000-0000-0000-0000-00000000f001'),
  0,
  'a pending venue is not visible to other users'
);

-- The moderator queue is empty for a non-moderator.
select is(
  (select count(*)::int from public.list_pending_venues()),
  0,
  'list_pending_venues returns nothing to a non-moderator'
);

-- A non-moderator cannot review a claim.
select throws_ok(
  $$ select public.review_venue(
       '00000000-0000-0000-0000-00000000f001', 'verified', null) $$,
  'P0001',
  'not authorized',
  'a non-moderator cannot review a venue'
);

-- ————————————————————————— appoint Mod, act as Mod —————————————————————————
reset role;
insert into public.platform_moderators (member_id)
  values ('00000000-0000-0000-0000-00000000d0d0');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d0d0","role":"authenticated"}', true);

-- Both pending claims show up in the moderator's queue.
select is(
  (select count(*)::int from public.list_pending_venues()),
  2,
  'a moderator sees the pending claims'
);

-- The moderator can verify a claim.
select lives_ok(
  $$ select public.review_venue(
       '00000000-0000-0000-0000-00000000f001', 'verified',
       'confirmed with the business') $$,
  'a moderator can verify a pending claim'
);

-- ————————————————————————— verified is now public —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
select is(
  (select status from public.venues
     where id = '00000000-0000-0000-0000-00000000f001'),
  'verified',
  'a verified venue is visible to any authenticated user'
);

select * from finish();
rollback;
