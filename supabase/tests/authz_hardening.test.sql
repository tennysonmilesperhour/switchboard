-- pgTAP regression tests for the authorization-hardening migration
-- (20260712120000_authz_hardening.sql), findings F1/F2/F6/F8.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- Convention (mirrors rls_invariants.test.sql): seed as the privileged migration
-- role, then switch to `authenticated` with a specific user's JWT claims to
-- exercise the policies and triggers exactly as that user would experience them.

begin;
select plan(7);

-- ————————————————————————— fixtures —————————————————————————
-- alice (owner/host), mallory (attacker/co-host), victim (never consents).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000ba11', 'mallory@example.com'),
  ('00000000-0000-0000-0000-0000000000cc', 'victim@example.com');
-- The on_auth_user_created trigger already inserted a profile row for each
-- auth.users row above, so upsert to set the fields this test needs.
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a11c', 'Alice', true),
  ('00000000-0000-0000-0000-00000000ba11', 'Mallory', true),
  ('00000000-0000-0000-0000-0000000000cc', 'Victim', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- F1 fixture: a genuine pending request FROM alice TO mallory. Mallory is the
-- addressee, so the pre-fix policy let her repoint requester_id at will.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-00000000ba11', 'pending');

-- F2 fixture: alice hosts an event; mallory is a co-host (is_event_host true).
-- Mallory also holds an accepted invite so can_view_event lets her SELECT the
-- event row — co-hosts alone are not covered by can_view_event, and an UPDATE
-- can only reach rows the actor can see, so without this her update would match
-- zero rows and never reach the freeze trigger.
insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000a11c', 'Alice dinner', 'inviting');
insert into public.event_cohosts (event_id, cohost_id, added_by) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000ba11', '00000000-0000-0000-0000-00000000a11c');
insert into public.invites (event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000ba11', 0, 'accepted');

-- F6 fixture: alice blocks mallory.
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-00000000ba11');

-- ————————————————————————— act as Mallory —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ba11","role":"authenticated"}', true);

-- F1: the addressee cannot repoint requester_id to forge a connection to a
-- victim who never consented (the freeze trigger raises).
select throws_ok(
  $$ update public.connections
       set requester_id = '00000000-0000-0000-0000-0000000000cc', status = 'accepted'
     where addressee_id = '00000000-0000-0000-0000-00000000ba11' $$,
  'P0001',
  'connection parties are immutable',
  'F1: addressee cannot repoint requester_id to forge a connection'
);

-- F1 positive control: accepting a genuine request (status only) still works.
select lives_ok(
  $$ update public.connections set status = 'accepted'
     where addressee_id = '00000000-0000-0000-0000-00000000ba11' $$,
  'F1: addressee can still accept a genuine request (status-only update)'
);

-- F2: a co-host cannot seize the primary host by writing host_id.
select throws_ok(
  $$ update public.events set host_id = '00000000-0000-0000-0000-00000000ba11'
     where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'P0001',
  'event host is immutable',
  'F2: a co-host cannot set host_id = self to seize primary-host powers'
);

-- F2 positive control: a co-host CAN still edit ordinary event fields.
select lives_ok(
  $$ update public.events set title = 'Alice brunch'
     where id = '00000000-0000-0000-0000-0000000e0001' $$,
  'F2: a co-host can still edit non-ownership event fields'
);

-- F6: a user blocked by the target cannot record a mutual intent toward them
-- (the WITH CHECK now consults are_blocked, so the write is denied by RLS).
select throws_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-00000000ba11',
             '00000000-0000-0000-0000-00000000a11c', 'coffee', 'down_to_connect', 'active') $$,
  '42501',
  null,
  'F6: a user blocked by the target cannot record a mutual intent toward them'
);

-- F6 positive control: a mutual intent toward a non-blocking user still inserts.
select lives_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-00000000ba11',
             '00000000-0000-0000-0000-0000000000cc', 'coffee', 'down_to_connect', 'active') $$,
  'F6: a mutual intent toward a non-blocking user still inserts'
);

-- ————————————————————————— F8 tripwire (schema) —————————————————————————
-- profiles_update is column-open by design (it restricts the row, not columns),
-- and there is no write-guard trigger, so any authority column added to
-- profiles would be self-writable by default. This assertion fails loudly the
-- moment such a column appears, forcing the author to add write protection
-- (a column REVOKE or a freeze trigger) — see docs/SECURITY.md.
select is(
  (select count(*)::int from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in (
         'role', 'is_admin', 'is_staff', 'is_moderator', 'rank', 'credits',
         'balance', 'verified', 'subscription_tier', 'reputation',
         'trust_score', 'karma', 'points', 'plan_tier'
       )),
  0,
  'F8 tripwire: profiles has no self-writable authority column'
);

select * from finish();
rollback;
