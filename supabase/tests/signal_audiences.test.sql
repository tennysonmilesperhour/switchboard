-- pgTAP coverage for 20260912120200_signal_audiences.sql.
--
-- A signal reaches the people it names, the members of a group it names, and
-- nobody else; an unconnected non-member never sees it; a block always wins.

begin;
select plan(8);

-- Alice owns the signals. Bob and Carol are connected to her; Dave is not
-- connected but shares a board with her; Erin shares the board and has
-- blocked her; Mallory is a stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f11c', 'alice2@example.com'),
  ('00000000-0000-0000-0000-00000000f0b0', 'bob2@example.com'),
  ('00000000-0000-0000-0000-0000000fca01', 'carol2@example.com'),
  ('00000000-0000-0000-0000-0000000fda0e', 'dave2@example.com'),
  ('00000000-0000-0000-0000-0000000fe011', 'erin2@example.com'),
  ('00000000-0000-0000-0000-00000000fba1', 'mallory2@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000f11c', 'Alice', true),
  ('00000000-0000-0000-0000-00000000f0b0', 'Bob', true),
  ('00000000-0000-0000-0000-0000000fca01', 'Carol', true),
  ('00000000-0000-0000-0000-0000000fda0e', 'Dave', true),
  ('00000000-0000-0000-0000-0000000fe011', 'Erin', true),
  ('00000000-0000-0000-0000-00000000fba1', 'Mallory', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000f11c', '00000000-0000-0000-0000-00000000f0b0', 'accepted'),
  ('00000000-0000-0000-0000-00000000f11c', '00000000-0000-0000-0000-0000000fca01', 'accepted');

insert into public.boards (id, slug, name, created_by) values
  ('00000000-0000-0000-0000-0000000fb0a1', 'tantra-circle', 'Tantra circle',
   '00000000-0000-0000-0000-00000000f11c');
insert into public.board_members (board_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000fb0a1', '00000000-0000-0000-0000-00000000f11c', 'moderator'),
  ('00000000-0000-0000-0000-0000000fb0a1', '00000000-0000-0000-0000-0000000fda0e', 'member'),
  ('00000000-0000-0000-0000-0000000fb0a1', '00000000-0000-0000-0000-0000000fe011', 'member');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000fe011', '00000000-0000-0000-0000-00000000f11c');

-- Signal 1: named people only (Bob). Signal 2: the board only.
insert into public.availability_signals (id, user_id, emoji, label, person_ids, board_ids, expires_at) values
  ('00000000-0000-0000-0000-0000000f5001', '00000000-0000-0000-0000-00000000f11c',
   '☕', 'Coffee Break', array['00000000-0000-0000-0000-00000000f0b0']::uuid[], '{}',
   now() + interval '3 hours'),
  ('00000000-0000-0000-0000-0000000f5002', '00000000-0000-0000-0000-00000000f11c',
   '🚶', 'Walk?', '{}', array['00000000-0000-0000-0000-0000000fb0a1']::uuid[],
   now() + interval '3 hours');

set local role authenticated;

-- Bob: named on the coffee signal; not in the board.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f0b0","role":"authenticated"}', true);
select is(
  (select array_agg(label order by label) from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  array['Coffee Break'],
  'a person named on a signal sees that signal and not the group one'
);

-- Carol: connected, but named on nothing and in no group.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fca01","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  0,
  'a connection who is neither named nor in the group sees neither signal'
);

-- Dave: not connected, but in the board.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fda0e","role":"authenticated"}', true);
select is(
  (select array_agg(label order by label) from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  array['Walk?'],
  'a group member who is not a connection sees the group signal only'
);

-- Erin: in the board, has blocked Alice.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fe011","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  0,
  'a block hides a group signal from the blocking member'
);

-- Mallory: a stranger.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000fba1","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  0,
  'a stranger sees nothing'
);

-- A board Alice is NOT in cannot be used as an audience: Mallory's board.
reset role;
insert into public.boards (id, slug, name, created_by) values
  ('00000000-0000-0000-0000-0000000fb0a2', 'not-alices', 'Not Alice''s',
   '00000000-0000-0000-0000-00000000fba1');
insert into public.board_members (board_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000fb0a2', '00000000-0000-0000-0000-00000000fba1', 'moderator'),
  ('00000000-0000-0000-0000-0000000fb0a2', '00000000-0000-0000-0000-0000000fda0e', 'member');
insert into public.availability_signals (id, user_id, emoji, label, board_ids, expires_at) values
  ('00000000-0000-0000-0000-0000000f5003', '00000000-0000-0000-0000-00000000f11c',
   '🎲', 'Game Night', array['00000000-0000-0000-0000-0000000fb0a2']::uuid[],
   now() + interval '3 hours');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000fda0e","role":"authenticated"}', true);
select is(
  (select array_agg(label order by label) from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  array['Walk?'],
  'a signal aimed at a group its owner is not in reaches nobody through it'
);

-- Naming a person who is no longer a connection does not reach them.
reset role;
delete from public.connections
  where requester_id = '00000000-0000-0000-0000-00000000f11c'
    and addressee_id = '00000000-0000-0000-0000-00000000f0b0';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f0b0","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.availability_signals
     where user_id = '00000000-0000-0000-0000-00000000f11c'),
  0,
  'a named person who is no longer connected sees nothing'
);

-- The audience arrays are bounded.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f11c","role":"authenticated"}', true);
select throws_ok(
  $$ update public.availability_signals
       set person_ids = array_fill('00000000-0000-0000-0000-00000000f0b0'::uuid, array[201])
       where id = '00000000-0000-0000-0000-0000000f5001' $$,
  '23514',
  null,
  'an audience list cannot be used as a bulk store'
);

select * from finish();
rollback;
