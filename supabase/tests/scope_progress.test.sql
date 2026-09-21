-- pgTAP coverage for 20260921120000_scope_progress.sql.
--
-- The shared checklist board. Like `client_feedback` it is written by people
-- with no account, so the table itself trusts nobody: RLS on, no policies, and
-- the route holding the service key mediates every read and write. What is
-- different here is that the route also SERVES this to anyone holding the URL,
-- which is the owner's explicit choice — so the thing to prove at this layer is
-- that the *database* is still not directly reachable, and that the item_id
-- shape holds, because that constraint is what bounds an open write surface.

begin;
select plan(9);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.scope_progress'::regclass),
  'scope_progress has row level security enabled'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'scope_progress'),
  0,
  'scope_progress has no policies, so no role reaches it except the service role'
);

insert into public.scope_progress (item_id, checked, updated_by)
values ('A1', true, 'Gina');

set local role anon;

select is(
  (select count(*)::int from public.scope_progress),
  0,
  'anon cannot read the board directly — it goes through the route, which rate-limits'
);

select throws_ok(
  $$ insert into public.scope_progress (item_id) values ('B2') $$,
  '42501',
  null,
  'anon cannot tick an item directly, bypassing the route''s limiter'
);

reset role;

-- The id shape is the cap on table size for an open write surface: without it,
-- any string could be a key and the row count would be unbounded.
select throws_ok(
  $$ insert into public.scope_progress (item_id) values ('not-an-item') $$,
  '23514',
  null,
  'a key that is not a checklist id is refused'
);

select throws_ok(
  $$ insert into public.scope_progress (item_id) values ('a1') $$,
  '23514',
  null,
  'a lowercase id is refused, so A1 and a1 cannot become two rows'
);

select throws_ok(
  $$ insert into public.scope_progress (item_id) values ('A') $$,
  '23514',
  null,
  'a letter with no number is refused'
);

select throws_ok(
  $$ insert into public.scope_progress (item_id, updated_by)
       values ('C3', repeat('z', 81)) $$,
  '23514',
  null,
  'a name over 80 characters is refused'
);

select lives_ok(
  $$ insert into public.scope_progress (item_id, checked) values ('J12', false) $$,
  'a real id with two digits, unticked, is accepted'
);

select * from finish();
rollback;
