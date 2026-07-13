-- pgTAP regression tests for the moderation queue
-- (20260713170000_moderation_queue.sql).
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- Convention (mirrors authz_hardening.test.sql): seed as the privileged migration
-- role, then switch to `authenticated` with a specific user's JWT claims to
-- exercise the definer functions and RLS exactly as that user would.

begin;
select plan(7);

-- ————————————————————————— fixtures —————————————————————————
-- mod (appointed later), reporter, target (reported), bob (ordinary user).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d0d0', 'mod@example.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'reporter@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'target@example.com'),
  ('00000000-0000-0000-0000-0000000000c3', 'bob@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000d0d0', 'Mod', true),
  ('00000000-0000-0000-0000-0000000000a1', 'Reporter', true),
  ('00000000-0000-0000-0000-0000000000b2', 'Target', true),
  ('00000000-0000-0000-0000-0000000000c3', 'Bob', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.user_reports (id, reporter_id, reported_id, reason) values
  ('00000000-0000-0000-0000-00000000e001',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-0000000000b2',
   'spam');

-- ————————————————————————— act as Bob (not a moderator) —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000c3","role":"authenticated"}', true);

select is(
  public.is_platform_moderator('00000000-0000-0000-0000-0000000000c3'),
  false,
  'an ordinary user is not a platform moderator'
);

select is(
  (select count(*)::int from public.list_open_reports()),
  0,
  'list_open_reports returns nothing to a non-moderator'
);

select throws_ok(
  $$ select public.resolve_report('00000000-0000-0000-0000-00000000e001', 'resolved', null) $$,
  'P0001',
  'not authorized',
  'a non-moderator cannot resolve a report'
);

select throws_ok(
  $$ insert into public.platform_moderators (member_id)
     values ('00000000-0000-0000-0000-0000000000c3') $$,
  '42501',
  'a user cannot appoint themselves a moderator (RLS deny-all)'
);

-- ————————————————————————— appoint Mod, then act as Mod —————————————————————————
reset role;
insert into public.platform_moderators (member_id)
  values ('00000000-0000-0000-0000-00000000d0d0');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d0d0","role":"authenticated"}', true);

select is(
  public.is_platform_moderator('00000000-0000-0000-0000-00000000d0d0'),
  true,
  'an appointed moderator is recognized'
);

select is(
  (select count(*)::int from public.list_open_reports()),
  1,
  'a moderator sees the open report'
);

select lives_ok(
  $$ select public.resolve_report('00000000-0000-0000-0000-00000000e001', 'resolved', 'handled') $$,
  'a moderator can resolve a report'
);

select * from finish();
rollback;
