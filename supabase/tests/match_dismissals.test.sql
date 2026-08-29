-- pgTAP coverage for 20260829120000_match_dismissals.sql.
--
-- The invariant worth proving is the one that makes a one-tap dismissal safe:
-- clearing a match off YOUR Home leaves the other person's Home alone. The
-- matches row is shared between two people, so a `dismissed` flag on it would
-- have failed this test — which is why the dismissal lives in its own table.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e201', 'match-ana@example.com'),
  ('00000000-0000-0000-0000-00000000e202', 'match-ben@example.com'),
  ('00000000-0000-0000-0000-00000000e203', 'match-outsider@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000e201', 'Ana', true),
  ('00000000-0000-0000-0000-00000000e202', 'Ben', true),
  ('00000000-0000-0000-0000-00000000e203', 'Outsider', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Two matches between the same pair, so the ordering/limit behaviour is
-- observable and not just a single-row special case.
insert into public.matches (id, user_a, user_b, activity, created_at) values
  ('00000000-0000-0000-0000-00000000f201',
   '00000000-0000-0000-0000-00000000e201',
   '00000000-0000-0000-0000-00000000e202',
   'Walk or hike', now() - interval '2 days'),
  ('00000000-0000-0000-0000-00000000f202',
   '00000000-0000-0000-0000-00000000e201',
   '00000000-0000-0000-0000-00000000e202',
   'Games', now() - interval '9 days');

set local role authenticated;

-- ————————————————————————— act as Ana —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e201","role":"authenticated"}',
  true
);

select results_eq(
  $$ select activity from public.my_recent_matches(10) $$,
  $$ values ('Walk or hike'::text), ('Games'::text) $$,
  'both matches reach Ana before she clears anything, newest first'
);

select lives_ok(
  $$ insert into public.match_dismissals (match_id, user_id)
       values ('00000000-0000-0000-0000-00000000f201',
               '00000000-0000-0000-0000-00000000e201') $$,
  'a party to a match can clear it off their own Home'
);

select results_eq(
  $$ select activity from public.my_recent_matches(10) $$,
  $$ values ('Games'::text) $$,
  'the cleared match no longer reaches Ana'
);

-- Filtering happens before the limit, so clearing promotes the next match up
-- rather than returning a shorter list. Home asks for a fixed number of cards;
-- this is what stops a dismissal quietly costing one of them.
select results_eq(
  $$ select activity from public.my_recent_matches(1) $$,
  $$ values ('Games'::text) $$,
  'a one-row limit returns the next match, not an empty slot where the cleared one was'
);

-- Ana cannot clear a card off Ben's Home by writing a dismissal in his name.
select throws_ok(
  $$ insert into public.match_dismissals (match_id, user_id)
       values ('00000000-0000-0000-0000-00000000f202',
               '00000000-0000-0000-0000-00000000e202') $$,
  '42501',
  null,
  'nobody can write a dismissal in someone else''s name'
);

-- ————————————————————————— act as Ben —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e202","role":"authenticated"}',
  true
);

-- The invariant this table exists for.
select results_eq(
  $$ select activity from public.my_recent_matches(10) $$,
  $$ values ('Walk or hike'::text), ('Games'::text) $$,
  'Ana clearing a match leaves Ben''s Home exactly as it was'
);

select is(
  (select count(*)::int from public.match_dismissals),
  0,
  'one person''s dismissals are not readable by the other party'
);

-- ————————————————————————— act as an outsider —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e203","role":"authenticated"}',
  true
);

-- Under user_id = auth.uid() alone this would succeed, and a successful insert
-- would confirm the uuid names a real match. The membership test in the policy
-- is what closes that.
select throws_ok(
  $$ insert into public.match_dismissals (match_id, user_id)
       values ('00000000-0000-0000-0000-00000000f201',
               '00000000-0000-0000-0000-00000000e203') $$,
  '42501',
  null,
  'someone outside a match cannot dismiss it, so this cannot probe for match ids'
);

select * from finish();
rollback;
