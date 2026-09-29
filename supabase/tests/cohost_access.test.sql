-- pgTAP coverage for co-host access (20260930010000_cohost_plan_access.sql).
--
-- Two halves, one test each:
--   * A co-host can open the plan they co-host and read its guest list, even
--     with no invitation of their own; a stranger still can't do either.
--   * Decision D1: the primary host may only make a co-host of an accepted
--     connection or someone already on this plan's guest list — never a
--     stranger, never across a block, and never an Open Table requester the
--     host has not let in.
--
--   supabase test db

begin;
select plan(14);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0501', 'cohost-host@example.com'),
  ('00000000-0000-0000-0000-0000000c0502', 'cohost-friend@example.com'),
  ('00000000-0000-0000-0000-0000000c0503', 'cohost-guest@example.com'),
  ('00000000-0000-0000-0000-0000000c0504', 'cohost-stranger@example.com'),
  ('00000000-0000-0000-0000-0000000c0505', 'cohost-blocked@example.com'),
  ('00000000-0000-0000-0000-0000000c0506', 'cohost-requester@example.com');
-- The on_auth_user_created trigger already made a profile row for each, so
-- upsert the fields this test needs.
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000c0501', 'Host', true),
  ('00000000-0000-0000-0000-0000000c0502', 'Friend', true),
  ('00000000-0000-0000-0000-0000000c0503', 'Guest', true),
  ('00000000-0000-0000-0000-0000000c0504', 'Stranger', true),
  ('00000000-0000-0000-0000-0000000c0505', 'Blocked', true),
  ('00000000-0000-0000-0000-0000000c0506', 'Requester', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- The friend and the blocked person are both accepted connections of the host;
-- the host has also blocked the second one.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000c0501', '00000000-0000-0000-0000-0000000c0502', 'accepted'),
  ('00000000-0000-0000-0000-0000000c0505', '00000000-0000-0000-0000-0000000c0501', 'accepted');
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000c0501', '00000000-0000-0000-0000-0000000c0505');

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000ec501', '00000000-0000-0000-0000-0000000c0501',
   'Co-hosted dinner', 'inviting');
-- The guest has a live invitation; the requester has only asked to join.
insert into public.invites (id, event_id, invitee_id, position, status, sent_at) values
  ('00000000-0000-0000-0000-0000000ac501', '00000000-0000-0000-0000-0000000ec501',
   '00000000-0000-0000-0000-0000000c0503', 0, 'sent', now()),
  ('00000000-0000-0000-0000-0000000ac502', '00000000-0000-0000-0000-0000000ec501',
   '00000000-0000-0000-0000-0000000c0506', 1, 'requested', null);

-- ————————————————————————— D1, as the primary host —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000c0501","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.event_cohosts (event_id, cohost_id, added_by)
       values ('00000000-0000-0000-0000-0000000ec501',
               '00000000-0000-0000-0000-0000000c0502',
               '00000000-0000-0000-0000-0000000c0501') $$,
  'D1: the host can make a co-host of an accepted connection'
);
select lives_ok(
  $$ insert into public.event_cohosts (event_id, cohost_id, added_by)
       values ('00000000-0000-0000-0000-0000000ec501',
               '00000000-0000-0000-0000-0000000c0503',
               '00000000-0000-0000-0000-0000000c0501') $$,
  'D1: the host can make a co-host of someone on the guest list'
);
select throws_ok(
  $$ insert into public.event_cohosts (event_id, cohost_id, added_by)
       values ('00000000-0000-0000-0000-0000000ec501',
               '00000000-0000-0000-0000-0000000c0504',
               '00000000-0000-0000-0000-0000000c0501') $$,
  '42501',
  null,
  'D1: a stranger cannot be made a co-host'
);
select throws_ok(
  $$ insert into public.event_cohosts (event_id, cohost_id, added_by)
       values ('00000000-0000-0000-0000-0000000ec501',
               '00000000-0000-0000-0000-0000000c0505',
               '00000000-0000-0000-0000-0000000c0501') $$,
  '42501',
  null,
  'D1: a connection across a block cannot be made a co-host'
);
select throws_ok(
  $$ insert into public.event_cohosts (event_id, cohost_id, added_by)
       values ('00000000-0000-0000-0000-0000000ec501',
               '00000000-0000-0000-0000-0000000c0506',
               '00000000-0000-0000-0000-0000000c0501') $$,
  '42501',
  null,
  'D1: an Open Table request the host has not let in does not qualify'
);

-- ————————————————————————— the co-host (no invitation) —————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000c0502","role":"authenticated"}', true);

select ok(
  public.can_current_user_view_event('00000000-0000-0000-0000-0000000ec501'),
  'a co-host with no invitation can view the plan'
);
select is(
  (select count(*)::int from public.events where id = '00000000-0000-0000-0000-0000000ec501'),
  1,
  'a co-host can read the plan row, so /events/<id> renders instead of bouncing to /join'
);
select is(
  (select count(*)::int from public.invites where event_id = '00000000-0000-0000-0000-0000000ec501'),
  2,
  'a co-host can read the plan''s guest list, including Open Table requests'
);
select lives_ok(
  $$ update public.events set title = 'Co-hosted brunch'
       where id = '00000000-0000-0000-0000-0000000ec501' $$,
  'a co-host can edit the plan'
);
select is(
  (select title from public.events where id = '00000000-0000-0000-0000-0000000ec501'),
  'Co-hosted brunch',
  'the co-host''s edit actually reached the row'
);
select throws_ok(
  $$ insert into public.event_cohosts (event_id, cohost_id, added_by)
       values ('00000000-0000-0000-0000-0000000ec501',
               '00000000-0000-0000-0000-0000000c0504',
               '00000000-0000-0000-0000-0000000c0502') $$,
  '42501',
  null,
  'a co-host still cannot add co-hosts of their own'
);

-- ————————————————————————— a stranger —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000c0504","role":"authenticated"}', true);

select ok(
  not public.can_current_user_view_event('00000000-0000-0000-0000-0000000ec501'),
  'a stranger still cannot view the plan'
);
select is(
  (select count(*)::int from public.events where id = '00000000-0000-0000-0000-0000000ec501'),
  0,
  'a stranger still cannot read the plan row'
);
select is(
  (select count(*)::int from public.invites where event_id = '00000000-0000-0000-0000-0000000ec501'),
  0,
  'a stranger still cannot read the guest list'
);

select * from finish();
rollback;
