-- pgTAP coverage for standing rituals (P8, decision D8), including
-- 20260930081000_ritual_reminders.sql. Rituals had no database tests at all
-- (completion plan Q4).
--
-- Only the two people see a ritual; only the invited partner accepts it; the
-- terms and the schedule are not writable from a session; skipping is theirs
-- alone and moves the date one cadence ahead; and the cron's claim reminds each
-- person once per due date, on their own due day, outside quiet hours, never
-- across a block and never while either of them is on sabbatical.

begin;
select plan(41);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b1701', 'ritual-creator@example.com'),
  ('00000000-0000-0000-0000-0000000b1702', 'ritual-partner@example.com'),
  ('00000000-0000-0000-0000-0000000b1703', 'ritual-stranger@example.com'),
  ('00000000-0000-0000-0000-0000000b1704', 'ritual-away@example.com');
insert into public.profiles (id, display_name, onboarded, timezone) values
  ('00000000-0000-0000-0000-0000000b1701', 'Rita Creator', true, 'UTC'),
  ('00000000-0000-0000-0000-0000000b1702', 'Pat Partner', true, 'UTC'),
  ('00000000-0000-0000-0000-0000000b1703', 'Sam Stranger', true, 'UTC'),
  ('00000000-0000-0000-0000-0000000b1704', 'Ari Away', true, 'UTC')
on conflict (id) do update
  set display_name = excluded.display_name,
      onboarded = excluded.onboarded,
      timezone = excluded.timezone,
      quiet_hours_start = null,
      quiet_hours_end = null;
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000b1701', '00000000-0000-0000-0000-0000000b1702', 'accepted'),
  ('00000000-0000-0000-0000-0000000b1701', '00000000-0000-0000-0000-0000000b1704', 'accepted');
update public.profiles set sabbatical = true
 where id = '00000000-0000-0000-0000-0000000b1704';

-- ————————————————————————— proposing —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1701","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.rituals (creator_id, partner_id, activity, cadence_days, status, due_on)
     values ('00000000-0000-0000-0000-0000000b1701', '00000000-0000-0000-0000-0000000b1702',
             'Coffee', 7, 'active', current_date) $$,
  '42501',
  null,
  'a proposer cannot write an already-accepted ritual'
);
select throws_ok(
  $$ insert into public.rituals (creator_id, partner_id, activity, cadence_days, due_on)
     values ('00000000-0000-0000-0000-0000000b1701', '00000000-0000-0000-0000-0000000b1702',
             'Coffee', 7, current_date - 30) $$,
  '42501',
  null,
  'nor a proposal with a due date already set'
);
select throws_ok(
  $$ insert into public.rituals (creator_id, partner_id, activity, cadence_days)
     values ('00000000-0000-0000-0000-0000000b1701', '00000000-0000-0000-0000-0000000b1703',
             'Coffee', 7) $$,
  '42501',
  null,
  'a ritual needs a connection'
);
select throws_ok(
  $$ insert into public.rituals (creator_id, partner_id, activity, cadence_days)
     values ('00000000-0000-0000-0000-0000000b1701', '00000000-0000-0000-0000-0000000b1704',
             'Coffee', 7) $$,
  '42501',
  null,
  'nobody on sabbatical is asked into a ritual'
);
select lives_ok(
  $$ insert into public.rituals (id, creator_id, partner_id, activity, cadence_days)
     values ('00000000-0000-0000-0000-0000000b17a1', '00000000-0000-0000-0000-0000000b1701',
             '00000000-0000-0000-0000-0000000b1702', 'Coffee', 7) $$,
  'a connection can be asked'
);

select throws_ok(
  $$ update public.rituals set status = 'active'
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'P0001',
  'only the invited partner can accept a ritual',
  'the proposer cannot accept their own proposal'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1703","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.rituals where id = '00000000-0000-0000-0000-0000000b17a1'),
  0,
  'a stranger cannot see the ritual'
);
select is(
  public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date),
  'not_found',
  'and cannot skip it, or learn it exists'
);

-- ————————————————————————— accepting —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1702","role":"authenticated"}', true);
select lives_ok(
  $$ update public.rituals set status = 'active'
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'the invited partner accepts'
);
select is(
  (select due_on from public.rituals where id = '00000000-0000-0000-0000-0000000b17a1'),
  current_date,
  'the first one is due the day it is accepted'
);
reset role;
select is(
  (select count(*)::int from public.ritual_reminders
    where ritual_id = '00000000-0000-0000-0000-0000000b17a1' and due_on = current_date),
  2,
  'accepting counts as day one''s nudge for both people'
);
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  0,
  'so the sweep does not remind them again today'
);

-- ————————————————————————— the terms and the schedule —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1702","role":"authenticated"}', true);
select throws_ok(
  $$ update public.rituals set cadence_days = 1
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'P0001',
  'a ritual''s activity and cadence are fixed once proposed',
  'neither person can change the cadence the other agreed to'
);
select throws_ok(
  $$ update public.rituals set due_on = current_date - 3
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'P0001',
  'a ritual''s schedule moves only by planning or skipping it',
  'nor rewrite the due date'
);
select throws_ok(
  $$ update public.rituals set last_planned_at = now() - interval '90 days'
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'P0001',
  'a ritual''s schedule moves only by planning or skipping it',
  'nor rewrite when it was last planned'
);
select throws_ok(
  $$ select * from public.ritual_reminders $$,
  '42501',
  null,
  'the reminder ledger is not readable from a session'
);
select throws_ok(
  $$ select * from public.claim_ritual_reminders() $$,
  '42501',
  null,
  'and a session cannot run the claim'
);

-- ————————————————————————— skipping —————————————————————————
select is(
  public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date - 7),
  'already_moved',
  'skipping names the occurrence, so a stale one moves nothing'
);
select is(
  public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date),
  'skipped',
  'either person can skip the one that is due'
);
select is(
  (select due_on from public.rituals where id = '00000000-0000-0000-0000-0000000b17a1'),
  current_date + 7,
  'skipping moves the due date one cadence ahead'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1701","role":"authenticated"}', true);
select is(
  public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date),
  'already_moved',
  'the other person skipping the same one at once moves it only once'
);
select is(
  public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date + 7),
  'not_due',
  'the next one cannot be skipped before it is due'
);
reset role;

-- Overdue: one cadence from today, not from a date already behind us.
update public.rituals set due_on = current_date - 20
 where id = '00000000-0000-0000-0000-0000000b17a1';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1701","role":"authenticated"}', true);
select public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date - 20);
select is(
  (select due_on from public.rituals where id = '00000000-0000-0000-0000-0000000b17a1'),
  current_date + 7,
  'skipping an overdue one moves it a cadence from today'
);
reset role;

-- ————————————————————————— the sweep —————————————————————————
update public.rituals set due_on = current_date - 1
 where id = '00000000-0000-0000-0000-0000000b17a1';
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  2,
  'a due ritual reminds both people'
);
select is(
  (select count(*)::int from public.ritual_reminders
    where ritual_id = '00000000-0000-0000-0000-0000000b17a1' and due_on = current_date - 1),
  2,
  'and records both reminders'
);
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  0,
  'a second sweep sends nothing: one reminder per ritual per due date'
);

-- Quiet hours: the creator is inside theirs this hour, the partner is not.
update public.rituals set due_on = current_date - 2
 where id = '00000000-0000-0000-0000-0000000b17a1';
update public.profiles
   set quiet_hours_start = extract(hour from now() at time zone 'UTC')::int,
       quiet_hours_end = (extract(hour from now() at time zone 'UTC')::int + 1) % 24
 where id = '00000000-0000-0000-0000-0000000b1701';
select is(
  (select array_agg(user_id) from public.claim_ritual_reminders()),
  array['00000000-0000-0000-0000-0000000b1702'::uuid],
  'someone in quiet hours waits; the other person is reminded'
);
update public.profiles set quiet_hours_start = null, quiet_hours_end = null
 where id = '00000000-0000-0000-0000-0000000b1701';
select is(
  (select array_agg(user_id) from public.claim_ritual_reminders()),
  array['00000000-0000-0000-0000-0000000b1701'::uuid],
  'and is reminded once their quiet hours end'
);

-- Their own due day, where they are: tomorrow is not today in UTC.
update public.rituals set due_on = current_date + 1
 where id = '00000000-0000-0000-0000-0000000b17a1';
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  0,
  'nobody is reminded before their own due day'
);

-- Sabbatical holds it for both.
update public.rituals set due_on = current_date - 3
 where id = '00000000-0000-0000-0000-0000000b17a1';
update public.profiles set sabbatical = true
 where id = '00000000-0000-0000-0000-0000000b1702';
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  0,
  'while either person is on sabbatical, neither is reminded'
);
update public.profiles set sabbatical = false
 where id = '00000000-0000-0000-0000-0000000b1702';

-- A block holds it for both.
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000b1702', '00000000-0000-0000-0000-0000000b1701');
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  0,
  'a block stops the reminders in both directions'
);
delete from public.profile_blocks
 where blocker_id = '00000000-0000-0000-0000-0000000b1702';

-- Paused holds it too.
update public.rituals set status = 'paused'
 where id = '00000000-0000-0000-0000-0000000b17a1';
select is(
  (select count(*)::int from public.claim_ritual_reminders()),
  0,
  'a paused ritual reminds nobody'
);

-- ————————————————————————— planning it —————————————————————————
update public.rituals set status = 'active'
 where id = '00000000-0000-0000-0000-0000000b17a1';
insert into public.events (id, host_id, title, status, invite_mode) values
  ('00000000-0000-0000-0000-0000000b17e1', '00000000-0000-0000-0000-0000000b1702',
   'Coffee', 'inviting', 'group'),
  ('00000000-0000-0000-0000-0000000b17e2', '00000000-0000-0000-0000-0000000b1702',
   'Coffee alone', 'inviting', 'group');
insert into public.invites (event_id, invitee_id, status, position) values
  ('00000000-0000-0000-0000-0000000b17e1', '00000000-0000-0000-0000-0000000b1701', 'sent', 0);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1703","role":"authenticated"}', true);
select is(
  public.note_ritual_planned('00000000-0000-0000-0000-0000000b17a1', '00000000-0000-0000-0000-0000000b17e1'),
  null,
  'a stranger cannot mark someone else''s ritual planned'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1702","role":"authenticated"}', true);
select is(
  public.note_ritual_planned('00000000-0000-0000-0000-0000000b17a1', '00000000-0000-0000-0000-0000000b17e2'),
  null,
  'a plan without the other person on it does not count'
);
select is(
  public.note_ritual_planned('00000000-0000-0000-0000-0000000b17a1', '00000000-0000-0000-0000-0000000b17e1'),
  current_date + 7,
  'the partner planning it counts, and the next one is due a cadence later'
);
reset role;
select isnt(
  (select last_planned_at from public.rituals where id = '00000000-0000-0000-0000-0000000b17a1'),
  null::timestamptz,
  'and it is recorded as planned'
);

-- ————————————————————————— ending —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1701","role":"authenticated"}', true);
select lives_ok(
  $$ update public.rituals set status = 'paused'
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'either person can pause it'
);
select lives_ok(
  $$ update public.rituals set status = 'ended'
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'either person can end it'
);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000b1702","role":"authenticated"}', true);
select throws_ok(
  $$ update public.rituals set status = 'active'
      where id = '00000000-0000-0000-0000-0000000b17a1' $$,
  'P0001',
  'an ended ritual stays ended',
  'an ended ritual cannot be revived'
);
select is(
  public.skip_ritual('00000000-0000-0000-0000-0000000b17a1', current_date + 7),
  'not_active',
  'nor skipped'
);
reset role;

select ok(
  has_function_privilege('service_role', 'public.claim_ritual_reminders(integer)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.skip_ritual(uuid, date)', 'EXECUTE'),
  'the claim is the server''s, and skipping needs a session'
);

select * from finish();
rollback;
