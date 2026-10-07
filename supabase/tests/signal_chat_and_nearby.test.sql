-- pgTAP tests for opening a conversation from a status and for the "a friend
-- nearby is down for something" notice.
--
-- What they pin down:
--   * private.visible_signals_of agrees with the signals_visible policy for
--     every viewer (the one place the audience rule is restated).
--   * open_signal_chat needs a status the caller can see, refuses strangers and
--     blocked people, and hands back the same room on a second tap.
--   * claim_signal_nearby_recipients only names recipients who are friends the
--     status is offered to, discoverable, sharing a fresh location, and close;
--     it claims each pair once per cooldown; and it is service-role only.

begin;
select plan(17);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice@example.com'),
  ('00000000-0000-0000-0000-0000000000b0', 'bob@example.com'),
  ('00000000-0000-0000-0000-0000000ca101', 'carol@example.com'),
  ('00000000-0000-0000-0000-0000000da7e0', 'dave@example.com'),
  ('00000000-0000-0000-0000-0000000e1a00', 'erin@example.com'),
  ('00000000-0000-0000-0000-00000000ba11', 'mallory@example.com');

insert into public.profiles (id, display_name, onboarded, discoverable) values
  ('00000000-0000-0000-0000-00000000a11c', 'Alice', true, true),
  ('00000000-0000-0000-0000-0000000000b0', 'Bob', true, true),
  ('00000000-0000-0000-0000-0000000ca101', 'Carol', true, false),
  ('00000000-0000-0000-0000-0000000da7e0', 'Dave', true, true),
  ('00000000-0000-0000-0000-0000000e1a00', 'Erin', true, true),
  ('00000000-0000-0000-0000-00000000ba11', 'Mallory', true, true)
on conflict (id) do update
  set display_name = excluded.display_name,
      onboarded = excluded.onboarded,
      discoverable = excluded.discoverable;

-- Alice is friends with Bob, Carol, Dave and Erin. Mallory is a stranger.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000000b0', 'accepted'),
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000ca101', 'accepted'),
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000da7e0', 'accepted'),
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000e1a00', 'accepted');

-- Alice's status goes to everyone she knows.
insert into public.availability_signals (id, user_id, emoji, label, expires_at) values
  ('00000000-0000-0000-0000-0000000515a1', '00000000-0000-0000-0000-00000000a11c',
   '🟢', 'Down to Hang', now() + interval '3 hours');

-- Everyone shares a live location. Bob is next door, Carol too (but is not
-- discoverable), Dave is across the country, Erin's pin went stale.
insert into public.live_locations (user_id, latitude, longitude, expires_at) values
  ('00000000-0000-0000-0000-00000000a11c', 40.7000, -74.0000, now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000000b0', 40.7010, -74.0010, now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000ca101', 40.7010, -74.0010, now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000da7e0', 34.0500, -118.2400, now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000e1a00', 40.7010, -74.0010, now() + interval '2 hours'),
  ('00000000-0000-0000-0000-00000000ba11', 40.7010, -74.0010, now() + interval '2 hours');
-- The write trigger stamps updated_at with now(), so it is switched off to age
-- a pin; the whole test rolls back.
alter table public.live_locations disable trigger live_locations_stamp_write;
update public.live_locations
  set updated_at = now() - interval '1 hour'
  where user_id = '00000000-0000-0000-0000-0000000e1a00';

-- ————————————————————————— the audience rule —————————————————————————
-- For every viewer, the helper and the policy must give the same answer.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  1,
  'a friend sees the status through the policy');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ba11","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  0,
  'a stranger does not see the status through the policy');
reset role;

select is(
  (select count(*)::int from private.visible_signals_of(
     '00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000000b0')),
  1,
  'the helper says the friend sees it');
select is(
  (select count(*)::int from private.visible_signals_of(
     '00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-00000000ba11')),
  0,
  'the helper says the stranger does not');

-- ————————————————————————— opening a conversation —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);

create temp table first_room as
  select public.open_signal_chat('00000000-0000-0000-0000-00000000a11c') as id;
grant all on first_room to authenticated;

select isnt((select id from first_room), null, 'a friend can open a chat from a visible status');
select is(
  public.open_signal_chat('00000000-0000-0000-0000-00000000a11c'),
  (select id from first_room),
  'tapping again returns the same room');
select is(
  (select count(*)::int from public.room_members where room_id = (select id from first_room)),
  2,
  'both people are in the room');

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ba11","role":"authenticated"}', true);
select is(
  public.open_signal_chat('00000000-0000-0000-0000-00000000a11c'),
  null,
  'a stranger cannot open a chat from a status they cannot see');
reset role;

-- Once the status has ended the existing thread still opens, a new one does not.
update public.availability_signals set expires_at = now() - interval '1 minute';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
select is(
  public.open_signal_chat('00000000-0000-0000-0000-00000000a11c'),
  (select id from first_room),
  'the existing thread still opens after the status ends');
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000da7e0","role":"authenticated"}', true);
select is(
  public.open_signal_chat('00000000-0000-0000-0000-00000000a11c'),
  null,
  'no new thread starts from a status that has ended');
reset role;
update public.availability_signals set expires_at = now() + interval '3 hours';

-- ————————————————————————— nearby recipients —————————————————————————
select is(
  (select array_agg(r order by r)
     from private.claim_signal_nearby_recipients(
       '00000000-0000-0000-0000-00000000a11c',
       array['00000000-0000-0000-0000-0000000515a1']::uuid[]) r),
  array['00000000-0000-0000-0000-0000000000b0']::uuid[],
  'only the discoverable, nearby, fresh-pin friend is named (not Carol, Dave, Erin, or the stranger)');

select is(
  (select count(*)::int
     from private.claim_signal_nearby_recipients(
       '00000000-0000-0000-0000-00000000a11c',
       array['00000000-0000-0000-0000-0000000515a1']::uuid[])),
  0,
  'the same friend is not claimed again inside the cooldown');

-- A block ends it.
delete from public.signal_nearby_notices;
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000000b0', '00000000-0000-0000-0000-00000000a11c');
select is(
  (select count(*)::int
     from private.claim_signal_nearby_recipients(
       '00000000-0000-0000-0000-00000000a11c',
       array['00000000-0000-0000-0000-0000000515a1']::uuid[])),
  0,
  'a blocked pair is never told');
delete from public.profile_blocks;

-- The owner's own pin has to be fresh too.
delete from public.signal_nearby_notices;
update public.live_locations
  set updated_at = now() - interval '1 hour'
  where user_id = '00000000-0000-0000-0000-00000000a11c';
select is(
  (select count(*)::int
     from private.claim_signal_nearby_recipients(
       '00000000-0000-0000-0000-00000000a11c',
       array['00000000-0000-0000-0000-0000000515a1']::uuid[])),
  0,
  'nobody is told while the owner is not sharing a live location');

-- ————————————————————————— who may call it —————————————————————————
select ok(
  not has_function_privilege('authenticated',
    'public.claim_signal_nearby_recipients(uuid, uuid[], double precision, interval, integer)',
    'EXECUTE'),
  'a signed-in person cannot ask who would be told');
select ok(
  not has_table_privilege('authenticated', 'public.signal_nearby_notices', 'SELECT'),
  'the notice ledger is not readable from the browser');

select * from finish();
rollback;
