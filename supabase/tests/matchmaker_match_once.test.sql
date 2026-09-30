-- pgTAP coverage for 20260930091000_matchmaker_match_once.sql.

begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000701a', 'match-once-proposer@example.com'),
  ('00000000-0000-0000-0000-00000000702b', 'match-once-a@example.com'),
  ('00000000-0000-0000-0000-00000000703c', 'match-once-b@example.com'),
  ('00000000-0000-0000-0000-00000000704d', 'match-once-stranger@example.com'),
  ('00000000-0000-0000-0000-00000000705e', 'match-once-c@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000701a', 'Proposer', true),
  ('00000000-0000-0000-0000-00000000702b', 'Person A', true),
  ('00000000-0000-0000-0000-00000000703c', 'Person B', true),
  ('00000000-0000-0000-0000-00000000704d', 'Stranger', true),
  ('00000000-0000-0000-0000-00000000705e', 'Person C', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000701a', '00000000-0000-0000-0000-00000000702b', 'accepted'),
  ('00000000-0000-0000-0000-00000000701a', '00000000-0000-0000-0000-00000000703c', 'accepted'),
  ('00000000-0000-0000-0000-00000000701a', '00000000-0000-0000-0000-00000000705e', 'accepted');

insert into public.matchmaker_proposals (id, proposer_id, person_a, person_b, activity) values
  ('00000000-0000-0000-0000-0000000e0701'::uuid, '00000000-0000-0000-0000-00000000701a',
   '00000000-0000-0000-0000-00000000702b', '00000000-0000-0000-0000-00000000703c', 'Climbing'),
  -- An intro between A and C that a block overtakes after it went out.
  ('00000000-0000-0000-0000-0000000e0702'::uuid, '00000000-0000-0000-0000-00000000701a',
   '00000000-0000-0000-0000-00000000702b', '00000000-0000-0000-0000-00000000705e', 'Coffee');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000705e', '00000000-0000-0000-0000-00000000702b');

-- ————————————————————————— the grants survive the replacement —————————————————
select ok(
  has_function_privilege('authenticated', 'private.respond_to_matchmaker(uuid, boolean)', 'execute'),
  'signed-in people can still answer an intro'
);
select ok(
  has_function_privilege('service_role', 'private.respond_to_matchmaker(uuid, boolean)', 'execute'),
  'the service role can execute the private body'
);
select ok(
  not has_function_privilege('anon', 'private.respond_to_matchmaker(uuid, boolean)', 'execute'),
  'an anonymous caller cannot'
);

set local role authenticated;

-- ————————————————————————— the first yes waits —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);
select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0701'::uuid, true),
  'open',
  'the first yes leaves the intro open'
);

-- ————————————————————————— the second yes makes the match —————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000703c","role":"authenticated"}', true);
select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0701'::uuid, true),
  'matched',
  'the call that completes the match is told it matched'
);

-- ————————————————————————— and only that one —————————————————————————
select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0701'::uuid, true),
  'already_matched',
  'answering again is not a second match'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);
select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0701'::uuid, true),
  'already_matched',
  'the other person answering again is not a second match either'
);
select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0701'::uuid, false),
  'already_matched',
  'a late no neither unmatches nor re-announces'
);

-- ————————————————————————— someone outside the intro —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000704d","role":"authenticated"}', true);
select throws_ok(
  $$ select public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0701'::uuid, true) $$,
  'P0001',
  'not your proposal',
  'someone outside the intro cannot learn it matched'
);

-- ————————————————————————— the block rule is unchanged —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);
select is(
  public.respond_to_matchmaker('00000000-0000-0000-0000-0000000e0702'::uuid, true),
  'closed',
  'an intro a block has overtaken still closes instead of matching'
);

reset role;

select is(
  (select row(status, a_response, b_response)::text from public.matchmaker_proposals
    where id = '00000000-0000-0000-0000-0000000e0701'::uuid),
  row('matched', 'accepted', 'accepted')::text,
  'the matched intro keeps both yeses after the repeat calls'
);

select is(
  (select count(*)::int from public.matches
    where user_a = least('00000000-0000-0000-0000-00000000702b'::uuid,
                         '00000000-0000-0000-0000-00000000703c'::uuid)
      and user_b = greatest('00000000-0000-0000-0000-00000000702b'::uuid,
                            '00000000-0000-0000-0000-00000000703c'::uuid)),
  1,
  'exactly one match row for the pair'
);

select is(
  (select count(*)::int from public.rooms r
    where r.kind = 'match'
      and exists (select 1 from public.room_members m
                  where m.room_id = r.id and m.member_id = '00000000-0000-0000-0000-00000000702b')
      and exists (select 1 from public.room_members m
                  where m.room_id = r.id and m.member_id = '00000000-0000-0000-0000-00000000703c')),
  1,
  'exactly one shared room for the pair'
);

select * from finish();
rollback;
