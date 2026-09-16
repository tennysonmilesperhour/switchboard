-- pgTAP coverage for 20260916120000_client_feedback.sql.
--
-- This is the app's only unauthenticated write surface, so the thing worth
-- proving is the negative: nothing off the public internet can read a row, and
-- nothing can write one either. The route holds the service key; `anon` and
-- `authenticated` hold nothing. The bounds are asserted here rather than only
-- in the route, because the route is not the last word on what the table will
-- accept.

begin;
select plan(12);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.client_feedback'::regclass),
  'client_feedback has row level security enabled'
);

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'client_feedback'),
  0,
  'client_feedback has no policies at all, so RLS denies every non-service role'
);

select is(
  (select public from storage.buckets where id = 'client-feedback'),
  false,
  'the screenshot bucket is private'
);

-- A row the anonymous reader must not be able to see.
insert into public.client_feedback (item_id, item_label, body, reporter)
values ('J4', 'Signals reach a group', 'The group picker is empty for me.', 'Gina');

set local role anon;

select is(
  (select count(*)::int from public.client_feedback),
  0,
  'anon cannot read any feedback row'
);

select throws_ok(
  $$ insert into public.client_feedback (body) values ('straight from the browser') $$,
  '42501',
  null,
  'anon cannot insert a feedback row directly — only the route, holding the service key, may'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fee01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.client_feedback),
  0,
  'a signed-in member cannot read feedback either — this is not member-visible data'
);

-- An UPDATE under RLS-with-no-policies does not raise: the USING clause simply
-- matches no rows, so it is a silent no-op. That is still the property worth
-- proving, so prove the outcome rather than an error code.
select lives_ok(
  $$ update public.client_feedback set status = 'declined' $$,
  'a signed-in member''s triage attempt does not error'
);

reset role;

select is(
  (select status from public.client_feedback limit 1),
  'new',
  '...because RLS matched no rows for it, so nothing was actually changed'
);

-- Bounds. Each of these is a CHECK so that a future second writer inherits it.
select throws_ok(
  $$ insert into public.client_feedback (body) values ('') $$,
  '23514',
  null,
  'an empty body is refused'
);

select throws_ok(
  $$ insert into public.client_feedback (body) values (repeat('x', 4001)) $$,
  '23514',
  null,
  'a body over 4000 characters is refused'
);

select throws_ok(
  $$ insert into public.client_feedback (body, screenshots)
       values ('too many', array['a','b','c','d','e']) $$,
  '23514',
  null,
  'more than four screenshots is refused'
);

select throws_ok(
  $$ insert into public.client_feedback (body, status) values ('bad state', 'merged') $$,
  '23514',
  null,
  'an unknown triage status is refused'
);

select * from finish();
rollback;
