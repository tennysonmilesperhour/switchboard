-- pgTAP coverage for 20261014120000_matchmaker_shared_hints.sql.
-- A masked introduction shows only what both people picked, only while it is
-- open, and only when both let discovery show their interests.

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000cb001', 'hint-proposer@example.com'),
  ('00000000-0000-0000-0000-0000000cb002', 'hint-x@example.com'),
  ('00000000-0000-0000-0000-0000000cb003', 'hint-y@example.com');
insert into public.profiles (id, display_name, onboarded, interests, down_to) values
  ('00000000-0000-0000-0000-0000000cb001', 'Proposer', true, '{}', '{}'),
  ('00000000-0000-0000-0000-0000000cb002', 'Xan', true, '{Hiking,Jazz,Pottery,Chess}', '{Coffee}'),
  ('00000000-0000-0000-0000-0000000cb003', 'Yara', true, '{Hiking,Pottery,Chess,Surfing}', '{Coffee,Drinks}')
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded,
      interests = excluded.interests, down_to = excluded.down_to;

insert into public.matchmaker_proposals (id, proposer_id, person_a, person_b, activity) values
  ('00000000-0000-0000-0000-0000000cb0e1', '00000000-0000-0000-0000-0000000cb001',
   '00000000-0000-0000-0000-0000000cb002', '00000000-0000-0000-0000-0000000cb003', 'Climbing');

select ok(
  not has_function_privilege('anon', 'public.my_matchmaker_proposals()', 'execute'),
  'signed-out callers still cannot list introductions'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cb002","role":"authenticated"}', true);

select is(
  (select shared from public.my_matchmaker_proposals()),
  array['Chess', 'Coffee', 'Hiking']::text[],
  'an open intro shows up to three things both people picked'
);
select ok(
  not exists (
    select 1 from public.my_matchmaker_proposals() p
    where p.shared && array['Jazz', 'Surfing', 'Drinks']::text[]
  ),
  'nothing only one of them picked is shown'
);
select is(
  (select other_name from public.my_matchmaker_proposals()),
  null,
  'the other person is still not named'
);

reset role;
update public.profiles set discovery_interests = false
  where id = '00000000-0000-0000-0000-0000000cb003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cb002","role":"authenticated"}', true);
select is(
  (select shared from public.my_matchmaker_proposals()),
  '{}'::text[],
  'when the other person hides their interests, nothing is shown'
);

reset role;
update public.profiles set discovery_interests = true
  where id = '00000000-0000-0000-0000-0000000cb003';
update public.profiles set discovery_interests = false
  where id = '00000000-0000-0000-0000-0000000cb002';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cb003","role":"authenticated"}', true);
select is(
  (select shared from public.my_matchmaker_proposals()),
  '{}'::text[],
  'and it is symmetric: hiding your own hides theirs too'
);

reset role;
update public.profiles set discovery_interests = true
  where id = '00000000-0000-0000-0000-0000000cb002';
update public.matchmaker_proposals set status = 'matched'
  where id = '00000000-0000-0000-0000-0000000cb0e1';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cb003","role":"authenticated"}', true);
select is(
  (select shared from public.my_matchmaker_proposals()),
  '{}'::text[],
  'after a match the hint gives way to the name'
);

select * from finish();
rollback;
