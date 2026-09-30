-- pgTAP coverage for 20260930080000_sabbatical_mode.sql (P6, decision D6).
--
-- A sabbatical mutes every text and email except what a plan the person is
-- already in says to them, while the in-app row is still written; it pauses
-- Mutual in both directions without trapping an old intent; and the note is
-- readable wherever the app shows it.

begin;
select plan(19);

-- ————————————————————————— fixtures —————————————————————————
-- Away: on sabbatical, texts on. Inbox: on sabbatical, email route.
-- Friend: connected to Away, not on sabbatical.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a6b01', 'sab-away@example.com'),
  ('00000000-0000-0000-0000-0000000a6b02', 'sab-inbox@example.com'),
  ('00000000-0000-0000-0000-0000000a6b03', 'sab-friend@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000a6b01', 'Sab Away', true),
  ('00000000-0000-0000-0000-0000000a6b02', 'Sab Inbox', true),
  ('00000000-0000-0000-0000-0000000a6b03', 'Sab Friend', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000a6b01', '00000000-0000-0000-0000-0000000a6b03', 'accepted');

update public.profiles
   set contact_phone = '+15555550611', timezone = 'UTC'
 where id = '00000000-0000-0000-0000-0000000a6b01';
update public.profiles
   set contact_email = 'sab-inbox@example.com', timezone = 'UTC'
 where id = '00000000-0000-0000-0000-0000000a6b02';
update public.profile_contacts
   set verified_at = now()
 where user_id in ('00000000-0000-0000-0000-0000000a6b01', '00000000-0000-0000-0000-0000000a6b02');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a6b01","role":"authenticated"}', true);
select public.set_sms_preferences(true, true, true);
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a6b02","role":"authenticated"}', true);
select public.set_notification_routes('email', 'email', false);
reset role;

-- An intent Away sent before going away, to prove withdrawal stays open.
insert into public.mutual_intents (id, author_id, target_id, activity, kind, status) values
  ('00000000-0000-0000-0000-0000000a6bf1', '00000000-0000-0000-0000-0000000a6b01',
   '00000000-0000-0000-0000-0000000a6b03', 'Coffee', 'down_to_connect', 'active');

update public.profiles
   set sabbatical = true, sabbatical_message = 'Back in the spring'
 where id in ('00000000-0000-0000-0000-0000000a6b01', '00000000-0000-0000-0000-0000000a6b02');

-- ————————————————————————— the list —————————————————————————
select ok(
  private.sabbatical_allows('event_cancelled')
    and private.sabbatical_allows('reminder')
    and private.sabbatical_allows('room_message'),
  'changes, reminders and messages from plans you are in still get through'
);
select ok(
  not private.sabbatical_allows('event_invite')
    and not private.sabbatical_allows('connection_request')
    and not private.sabbatical_allows('ritual'),
  'new invitations, requests and rituals do not'
);
select ok(
  not private.sabbatical_allows('a_kind_nobody_decided_on')
    and not private.sabbatical_allows(null),
  'a kind nobody put on the list is muted'
);

-- ————————————————————————— texts —————————————————————————
insert into public.notifications (id, user_id, kind, title, body, url) values
  ('00000000-0000-0000-0000-0000000a6bb1', '00000000-0000-0000-0000-0000000a6b01',
   'event_invite', 'You are invited', 'A plan', '/notifications'),
  ('00000000-0000-0000-0000-0000000a6bb2', '00000000-0000-0000-0000-0000000a6b01',
   'event_cancelled', 'Called off', 'A plan you are in', '/notifications');

select is(
  (select count(*)::int from public.notifications
    where id = '00000000-0000-0000-0000-0000000a6bb1'),
  1,
  'a muted invitation still lands in the inbox'
);
select is(
  (select count(*)::int from public.sms_jobs
    where notification_id = '00000000-0000-0000-0000-0000000a6bb1'),
  0,
  'but is not texted to someone on sabbatical'
);
select is(
  (select count(*)::int from public.sms_jobs
    where notification_id = '00000000-0000-0000-0000-0000000a6bb2'),
  1,
  'a cancellation of a plan they are in is still texted'
);

update public.profiles set sabbatical = false
 where id = '00000000-0000-0000-0000-0000000a6b01';
insert into public.notifications (id, user_id, kind, title, body, url) values
  ('00000000-0000-0000-0000-0000000a6bb3', '00000000-0000-0000-0000-0000000a6b01',
   'event_invite', 'You are invited', 'Another plan', '/notifications');
select is(
  (select count(*)::int from public.sms_jobs
    where notification_id = '00000000-0000-0000-0000-0000000a6bb3'),
  1,
  'positive control: the same invitation is texted once the sabbatical ends'
);
update public.profiles set sabbatical = true
 where id = '00000000-0000-0000-0000-0000000a6b01';

-- ————————————————————————— emails —————————————————————————
insert into public.notifications (id, user_id, kind, title, body, url) values
  ('00000000-0000-0000-0000-0000000a6bc1', '00000000-0000-0000-0000-0000000a6b02',
   'join_request', 'Someone asked to join', 'A plan', '/notifications'),
  ('00000000-0000-0000-0000-0000000a6bc2', '00000000-0000-0000-0000-0000000a6b02',
   'event_updated', 'Plan changed', 'A plan you are in', '/notifications');
select is(
  (select count(*)::int from public.notification_email_jobs
    where notification_id = '00000000-0000-0000-0000-0000000a6bc1'),
  0,
  'a muted kind is not emailed to someone on sabbatical'
);
select is(
  (select count(*)::int from public.notification_email_jobs
    where notification_id = '00000000-0000-0000-0000-0000000a6bc2'),
  1,
  'a change to a plan they are in is still emailed'
);

-- Guest texts carry no account and no sabbatical; the hold leaves them alone.
insert into public.sms_jobs (phone, body, category)
values ('+15555550699', 'Switchboard: guest text', 'plans');
select is(
  (select count(*)::int from public.sms_jobs where phone = '+15555550699'),
  1,
  'a guest text is never held'
);

-- ————————————————————————— Mutual —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a6b03","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-0000000a6b03',
             '00000000-0000-0000-0000-0000000a6b01', 'Coffee', 'down_to_connect', 'active') $$,
  '42501',
  null,
  'nobody can aim Mutual interest at someone on sabbatical'
);
select is(
  (select sabbatical_message from public.profiles
    where id = '00000000-0000-0000-0000-0000000a6b01'),
  'Back in the spring',
  'a friend can read the note the profile and invite picker show'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a6b01","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-0000000a6b01',
             '00000000-0000-0000-0000-0000000a6b03', 'Dinner', 'down_to_connect', 'active') $$,
  '42501',
  null,
  'and someone on sabbatical cannot send it'
);
select throws_ok(
  $$ update public.mutual_intents set status = 'active', activity = 'Hiking'
      where id = '00000000-0000-0000-0000-0000000a6bf1' $$,
  '42501',
  null,
  'nor re-aim an old intent while away'
);
select lives_ok(
  $$ update public.mutual_intents set status = 'withdrawn'
      where id = '00000000-0000-0000-0000-0000000a6bf1' $$,
  'withdrawing an old intent is always allowed'
);
select is(
  (select status from public.mutual_intents
    where id = '00000000-0000-0000-0000-0000000a6bf1'),
  'withdrawn',
  'and the withdrawal took'
);
reset role;

update public.profiles set sabbatical = false
 where id = '00000000-0000-0000-0000-0000000a6b01';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a6b03","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind, status)
     values ('00000000-0000-0000-0000-0000000a6b03',
             '00000000-0000-0000-0000-0000000a6b01', 'Coffee', 'down_to_connect', 'active') $$,
  'positive control: Mutual reopens when the sabbatical ends'
);
reset role;

-- ————————————————————————— reach —————————————————————————
select ok(
  not has_function_privilege('authenticated', 'private.sabbatical_mutes(uuid, text)', 'EXECUTE'),
  'the mute check is not callable from a session'
);
select ok(
  has_function_privilege('service_role', 'private.sabbatical_mutes(uuid, text)', 'EXECUTE'),
  'but the server can run it'
);

select * from finish();
rollback;
