-- pgTAP regression test for multi-audience availability signals.
--
-- A signal's audience is the `circle_ids` array: empty means "everyone I know"
-- (still gated by are_connected), and a non-empty array means a connection who
-- belongs to at least ONE listed circle can see it. This proves the
-- signals_visible policy honours the union semantics and never leaks a signal to
-- a non-connection.
--
-- Convention mirrors rls_invariants.test.sql: seed as the migration role, then
-- switch to `authenticated` with a specific user's JWT to exercise RLS.

begin;
select plan(5);

-- ————————————————————————— fixtures —————————————————————————
-- Alice owns the signals and two circles. Bob is in "Close Friends", Carol is in
-- "Neighbors"; both are connected to Alice. Mallory is a signed-in stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice@example.com'),
  ('00000000-0000-0000-0000-0000000000b0', 'bob@example.com'),
  ('00000000-0000-0000-0000-0000000ca101', 'carol@example.com'),
  ('00000000-0000-0000-0000-00000000ba11', 'mallory@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a11c', 'Alice', true),
  ('00000000-0000-0000-0000-0000000000b0', 'Bob', true),
  ('00000000-0000-0000-0000-0000000ca101', 'Carol', true),
  ('00000000-0000-0000-0000-00000000ba11', 'Mallory', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Alice is connected to Bob and Carol, but not to Mallory.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000000b0', 'accepted'),
  ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000ca101', 'accepted');

insert into public.circles (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000a11c', 'Close Friends'),
  ('00000000-0000-0000-0000-00000000c206', '00000000-0000-0000-0000-00000000a11c', 'Neighbors');

insert into public.circle_members (circle_id, member_id) values
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-0000000000b0'),
  ('00000000-0000-0000-0000-00000000c206', '00000000-0000-0000-0000-0000000ca101');

-- Alice lights one signal, aimed at Close Friends only.
insert into public.availability_signals (id, user_id, emoji, label, circle_ids, expires_at) values
  ('00000000-0000-0000-0000-0000000515a1', '00000000-0000-0000-0000-00000000a11c',
   '☕', 'Coffee Break', array['00000000-0000-0000-0000-00000000c105']::uuid[],
   now() + interval '3 hours');

set local role authenticated;

-- ————————————————————————— Close Friends only —————————————————————————
-- Bob (in Close Friends) sees it.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000b0","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  1,
  'a member of the targeted circle can see the signal'
);

-- Carol (connected, but only in Neighbors) does NOT see a Close-Friends signal.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000ca101","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  0,
  'a connection outside every targeted circle cannot see the signal'
);

-- ————————————————————————— add Neighbors to the audience —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);
update public.availability_signals
  set circle_ids = array['00000000-0000-0000-0000-00000000c105',
                         '00000000-0000-0000-0000-00000000c206']::uuid[]
  where id = '00000000-0000-0000-0000-0000000515a1';

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000ca101","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  1,
  'adding a second circle to the union reveals the signal to its members'
);

-- ————————————————————————— everyone I know (empty array) —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);
update public.availability_signals
  set circle_ids = '{}'::uuid[]
  where id = '00000000-0000-0000-0000-0000000515a1';

-- Carol (a connection) now sees the everyone-scoped signal.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000ca101","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  1,
  'an empty audience is visible to any connection'
);

-- Mallory (not connected) never sees it, even when scoped to everyone.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ba11","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000a11c'),
  0,
  'a non-connection cannot see the signal regardless of audience'
);

select * from finish();
rollback;
