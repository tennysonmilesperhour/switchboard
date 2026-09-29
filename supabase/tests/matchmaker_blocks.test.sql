-- pgTAP coverage for 20260929170000_matchmaker_blocks.sql.

begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000601a', 'friend-in-middle@example.com'),
  ('00000000-0000-0000-0000-00000000602b', 'blocker@example.com'),
  ('00000000-0000-0000-0000-00000000603c', 'blocked@example.com'),
  ('00000000-0000-0000-0000-00000000604d', 'third@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000601a', 'Proposer', true),
  ('00000000-0000-0000-0000-00000000602b', 'Blocker', true),
  ('00000000-0000-0000-0000-00000000603c', 'Blocked', true),
  ('00000000-0000-0000-0000-00000000604d', 'Third', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- The proposer is connected to all three.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000601a', '00000000-0000-0000-0000-00000000602b', 'accepted'),
  ('00000000-0000-0000-0000-00000000601a', '00000000-0000-0000-0000-00000000603c', 'accepted'),
  ('00000000-0000-0000-0000-00000000601a', '00000000-0000-0000-0000-00000000604d', 'accepted');

-- An intro that went out before the block.
insert into public.matchmaker_proposals (id, proposer_id, person_a, person_b, activity) values
  ('00000000-0000-0000-0000-0000000d0601'::uuid, '00000000-0000-0000-0000-00000000601a',
   '00000000-0000-0000-0000-00000000602b', '00000000-0000-0000-0000-00000000603c', 'Coffee');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000602b', '00000000-0000-0000-0000-00000000603c');

set local role authenticated;

-- ————————————————————————— as the proposer —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000601a","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.matchmaker_proposals (proposer_id, person_a, person_b, activity)
     values ('00000000-0000-0000-0000-00000000601a', '00000000-0000-0000-0000-00000000603c',
             '00000000-0000-0000-0000-00000000602b', 'Dinner') $$,
  '42501',
  null,
  'a mutual friend cannot introduce two people who have blocked each other'
);

select lives_ok(
  $$ insert into public.matchmaker_proposals (proposer_id, person_a, person_b, activity)
     values ('00000000-0000-0000-0000-00000000601a', '00000000-0000-0000-0000-00000000602b',
             '00000000-0000-0000-0000-00000000604d', 'Dinner') $$,
  'an intro between two people with no block still goes through'
);

-- ————————————————————————— the blocked side answers yes —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000603c","role":"authenticated"}', true);

select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000d0601'::uuid, true),
  'closed',
  'an intro that predates the block is closed, not answered'
);

reset role;

select is(
  (select status from public.matchmaker_proposals
    where id = '00000000-0000-0000-0000-0000000d0601'::uuid),
  'closed',
  'the intro is recorded as closed'
);

select is(
  (select count(*)::int from public.rooms r
    join public.room_members m on m.room_id = r.id
    where r.kind = 'match'
      and m.member_id = '00000000-0000-0000-0000-00000000603c'),
  0,
  'no shared room is created for a blocked pair'
);

select * from finish();
rollback;
