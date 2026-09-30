-- pgTAP coverage for the people controls added on 2026-09-30:
--   20260930023000_household_members_connections.sql  (P9)
--   20260930024000_unmatch.sql                         (G37)
--   20260930025000_connection_request_ignores.sql      (G34)

begin;
select plan(15);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a401', 'people-owner@example.com'),
  ('00000000-0000-0000-0000-00000000a402', 'people-friend@example.com'),
  ('00000000-0000-0000-0000-00000000a403', 'people-stranger@example.com'),
  ('00000000-0000-0000-0000-00000000a404', 'people-asker@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a401', 'Owner', true),
  ('00000000-0000-0000-0000-00000000a402', 'Friend', true),
  ('00000000-0000-0000-0000-00000000a403', 'Stranger', true),
  ('00000000-0000-0000-0000-00000000a404', 'Asker', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000a402', 'accepted'),
  -- The asker keeps asking the owner.
  ('00000000-0000-0000-0000-00000000a404', '00000000-0000-0000-0000-00000000a401', 'pending');

insert into public.households (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000a401', 'The Riveras');

-- A match between the owner and the friend, with its room and both intents.
insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-00000000b402', 'match', 'Tennis', '00000000-0000-0000-0000-00000000a401');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-00000000b402', '00000000-0000-0000-0000-00000000a401'),
  ('00000000-0000-0000-0000-00000000b402', '00000000-0000-0000-0000-00000000a402');
insert into public.messages (room_id, sender_id, body) values
  ('00000000-0000-0000-0000-00000000b402', '00000000-0000-0000-0000-00000000a402', 'Saturday?');
insert into public.mutual_intents (author_id, target_id, activity, kind, status) values
  ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000a402', 'Tennis', 'down_to_connect', 'matched'),
  ('00000000-0000-0000-0000-00000000a402', '00000000-0000-0000-0000-00000000a401', 'Tennis', 'down_to_connect', 'matched');
insert into public.matches (id, user_a, user_b, activity, kind, room_id) values
  ('00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000a401',
   '00000000-0000-0000-0000-00000000a402', 'Tennis', 'down_to_connect',
   '00000000-0000-0000-0000-00000000b402');

set local role authenticated;

-- ————————————————————————— households (P9) —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a401","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.household_members (household_id, member_id)
     values ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000a402') $$,
  'an owner can add a connection to their household'
);

select throws_ok(
  $$ insert into public.household_members (household_id, member_id)
     values ('00000000-0000-0000-0000-00000000b401', '00000000-0000-0000-0000-00000000a403') $$,
  '42501',
  null,
  'nobody is filed into a household by someone they are not connected to'
);

-- The two tables' policies used to read each other and recurse, so no
-- household could be read or written at all.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a402","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.households
    where id = '00000000-0000-0000-0000-00000000b401'),
  1,
  'a member can see the household they are in'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a403","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.households
    where id = '00000000-0000-0000-0000-00000000b401'),
  0,
  'someone outside it cannot'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a401","role":"authenticated"}', true);

select lives_ok(
  $$ delete from public.household_members
     where household_id = '00000000-0000-0000-0000-00000000b401'
       and member_id = '00000000-0000-0000-0000-00000000a402' $$,
  'an owner can take someone out again'
);

-- ————————————————————————— ignore sticks (G34) —————————————————————————
select is(
  (select count(*)::int from public.connections
    where requester_id = '00000000-0000-0000-0000-00000000a404'),
  1,
  'before ignoring, the request is visible to the person asked'
);

select lives_ok(
  $$ insert into public.connection_request_ignores (ignorer_id, ignored_id)
     values ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000a404') $$,
  'the person asked can ignore it'
);

select is(
  (select count(*)::int from public.connections
    where requester_id = '00000000-0000-0000-0000-00000000a404'),
  0,
  'an ignored request is hidden from the person who ignored it'
);

select lives_ok(
  $$ update public.connection_request_ignores
        set ignored_at = now() - interval '91 days'
      where ignorer_id = '00000000-0000-0000-0000-00000000a401' $$,
  'an ignore can age'
);

select is(
  (select count(*)::int from public.connections
    where requester_id = '00000000-0000-0000-0000-00000000a404'),
  1,
  'after 90 days the request shows again'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a404","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.connection_request_ignores),
  0,
  'the person ignored can never see that they were'
);

-- ————————————————————————— unmatch (G37) —————————————————————————
select is(
  public.unmatch('00000000-0000-0000-0000-00000000c401'),
  'not_found',
  'someone outside the match cannot end it'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a402","role":"authenticated"}', true);

select is(
  public.unmatch('00000000-0000-0000-0000-00000000c401'),
  'unmatched',
  'either person can unmatch'
);

reset role;

select is(
  (select count(*)::int from public.rooms
    where id = '00000000-0000-0000-0000-00000000b402'),
  0,
  'the match room goes with the match'
);

select is(
  (select count(*)::int from public.mutual_intents
    where activity = 'Tennis'
      and author_id in ('00000000-0000-0000-0000-00000000a401', '00000000-0000-0000-0000-00000000a402')
      and status <> 'withdrawn'),
  0,
  'both halves of the interest are withdrawn, so neither can re-match the pair alone'
);

select * from finish();
rollback;
