-- pgTAP coverage for `set_invite_stage` (20260922020000_invite_stage_editing.sql):
-- moving somebody between waves while the invitations are in motion.
--
-- The rules, one test each: a host may move a queued invite, a co-host may too,
-- an invited guest may not, an invite that has already gone out cannot be moved,
-- and the wave has to be one the plan has (or the one after it) rather than any
-- integer a caller cares to send.
--
--   supabase test db

begin;
select plan(11);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'host@example.com'),
  ('00000000-0000-0000-0000-00000000c002', 'cohost@example.com'),
  ('00000000-0000-0000-0000-00000000c003', 'guest@example.com'),
  ('00000000-0000-0000-0000-00000000c004', 'other@example.com');
-- The on_auth_user_created trigger already made a profile row for each, so
-- upsert the fields this test needs.
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000c001', 'Host', true),
  ('00000000-0000-0000-0000-00000000c002', 'Co-host', true),
  ('00000000-0000-0000-0000-00000000c003', 'Guest', true),
  ('00000000-0000-0000-0000-00000000c004', 'Other', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- A wave plan with invitations in motion: wave 1 has gone out, wave 2 waits.
insert into public.events (id, host_id, title, status, invite_mode) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000c001',
   'Two waves', 'inviting', 'group');
insert into public.event_cohosts (event_id, cohost_id, added_by) values
  ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000c002',
   '00000000-0000-0000-0000-00000000c001');
insert into public.invites (id, event_id, invitee_id, position, group_stage, status, sent_at) values
  -- wave 1, already asked
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000e001',
   '00000000-0000-0000-0000-00000000c003', 0, 0, 'sent', now()),
  -- wave 2, still waiting
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000e001',
   '00000000-0000-0000-0000-00000000c004', 1, 1, 'queued', null);

-- ————————————————————————— the host —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

select lives_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', 0) $$,
  'the host can move a queued invite into the wave that already went out'
);
select is(
  (select group_stage from public.invites where id = '00000000-0000-0000-0000-00000000a002'),
  0,
  'the wave change is stored'
);

-- One past the last wave, so a host can push somebody to the back. Both invites
-- now sit in wave 1 (the row above moved there), so the highest stage is 0 and
-- stage 1 is the one after it.
select lives_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', 1) $$,
  'a host can push somebody into the wave after the last one'
);

select throws_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', 3) $$,
  'P0001',
  'that wave does not exist yet',
  'a wave further out than the next one is refused, so the engine never reads a gap as resolved'
);
select throws_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', 9) $$,
  'P0001',
  'wave must be between 1 and 5',
  'a wave beyond the five the wizard offers is refused'
);
select throws_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', -1) $$,
  'P0001',
  'wave must be between 1 and 5',
  'a negative wave is refused'
);

-- An invitation that has already reached somebody is history, not a draft.
select throws_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a001', 1) $$,
  'P0001',
  'only invites that have not gone out can change wave',
  'a sent invite cannot be moved between waves'
);
select is(
  (select group_stage from public.invites where id = '00000000-0000-0000-0000-00000000a001'),
  0,
  'the sent invite stayed where it was'
);

-- ————————————————————————— the co-host —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', 0) $$,
  'a co-host manages the line like the host does'
);

-- ————————————————————————— an invited guest —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_invite_stage('00000000-0000-0000-0000-00000000a002', 1) $$,
  'P0001',
  'not authorized',
  'a guest on the plan cannot reorder the waves'
);

-- ————————————————————————— anonymous —————————————————————————
reset role;
select ok(
  not has_function_privilege('anon', 'public.set_invite_stage(uuid, int)', 'EXECUTE'),
  'the anonymous role cannot execute set_invite_stage at all'
);

select * from finish();
rollback;
