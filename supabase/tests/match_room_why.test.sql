-- pgTAP coverage for 20261014122000_match_room_why.sql.
-- A match room explains itself to the two people in it, and to nobody else.

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000cc001', 'why-a@example.com'),
  ('00000000-0000-0000-0000-0000000cc002', 'why-b@example.com'),
  ('00000000-0000-0000-0000-0000000cc003', 'why-outsider@example.com'),
  ('00000000-0000-0000-0000-0000000cc004', 'why-proposer@example.com');
insert into public.profiles (id, display_name, onboarded, interests, down_to) values
  ('00000000-0000-0000-0000-0000000cc001', 'Ada', true, '{Hiking,Jazz}', '{Coffee}'),
  ('00000000-0000-0000-0000-0000000cc002', 'Bo', true, '{Hiking,Surfing}', '{Coffee}'),
  ('00000000-0000-0000-0000-0000000cc003', 'Outsider', true, '{Hiking}', '{Coffee}'),
  ('00000000-0000-0000-0000-0000000cc004', 'Priya', true, '{}', '{}')
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded,
      interests = excluded.interests, down_to = excluded.down_to;

insert into public.events (id, host_id, title, status, starts_at) values
  ('00000000-0000-0000-0000-0000000cce01', '00000000-0000-0000-0000-0000000cc001', 'Supper club', 'past', now() - interval '3 days');

-- A hang_again match with its room.
insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-0000000cc0a1', 'match', 'Hang out again', '00000000-0000-0000-0000-0000000cc001'),
  ('00000000-0000-0000-0000-0000000cc0a2', 'match', 'Climbing', '00000000-0000-0000-0000-0000000cc001');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-0000000cc0a1', '00000000-0000-0000-0000-0000000cc001'),
  ('00000000-0000-0000-0000-0000000cc0a1', '00000000-0000-0000-0000-0000000cc002'),
  ('00000000-0000-0000-0000-0000000cc0a2', '00000000-0000-0000-0000-0000000cc001'),
  ('00000000-0000-0000-0000-0000000cc0a2', '00000000-0000-0000-0000-0000000cc002');
insert into public.matches (user_a, user_b, activity, kind, event_id, room_id) values
  (least('00000000-0000-0000-0000-0000000cc001'::uuid, '00000000-0000-0000-0000-0000000cc002'::uuid),
   greatest('00000000-0000-0000-0000-0000000cc001'::uuid, '00000000-0000-0000-0000-0000000cc002'::uuid),
   'Hang out again', 'hang_again', '00000000-0000-0000-0000-0000000cce01', '00000000-0000-0000-0000-0000000cc0a1'),
  (least('00000000-0000-0000-0000-0000000cc001'::uuid, '00000000-0000-0000-0000-0000000cc002'::uuid),
   greatest('00000000-0000-0000-0000-0000000cc001'::uuid, '00000000-0000-0000-0000-0000000cc002'::uuid),
   'Climbing', 'down_to_connect', null, '00000000-0000-0000-0000-0000000cc0a2');
insert into public.matchmaker_proposals (proposer_id, person_a, person_b, activity, a_response, b_response, status, room_id) values
  ('00000000-0000-0000-0000-0000000cc004', '00000000-0000-0000-0000-0000000cc001', '00000000-0000-0000-0000-0000000cc002',
   'Climbing', 'accepted', 'accepted', 'matched', '00000000-0000-0000-0000-0000000cc0a2');

select ok(
  not has_function_privilege('anon', 'public.match_room_why(uuid)', 'execute'),
  'signed-out callers cannot ask'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cc001","role":"authenticated"}', true);

select is(
  (select kind from public.match_room_why('00000000-0000-0000-0000-0000000cc0a1')),
  'hang_again',
  'a member hears how they matched'
);
select is(
  (select event_title from public.match_room_why('00000000-0000-0000-0000-0000000cc0a1')),
  'Supper club',
  'a hang_again room names the plan both were at'
);
select is(
  (select shared from public.match_room_why('00000000-0000-0000-0000-0000000cc0a1')),
  array['Coffee', 'Hiking']::text[],
  'and only what both picked'
);
select is(
  (select introduced_by from public.match_room_why('00000000-0000-0000-0000-0000000cc0a2')),
  'Priya',
  'a matchmaker room names the friend who introduced them'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cc003","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.match_room_why('00000000-0000-0000-0000-0000000cc0a1')),
  0,
  'someone outside the match learns nothing'
);

reset role;
update public.profiles set discovery_interests = false
  where id = '00000000-0000-0000-0000-0000000cc002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cc001","role":"authenticated"}', true);
select is(
  (select shared from public.match_room_why('00000000-0000-0000-0000-0000000cc0a1')),
  '{}'::text[],
  'shared picks follow the same discovery_interests rule as everywhere else'
);

select * from finish();
rollback;
