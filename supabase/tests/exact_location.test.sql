-- pgTAP tests for exact location between matched people
-- (20261008120000_exact_location_in_match_rooms.sql).
--
-- The contract under test:
--   * Two-person rooms only (match, moment), members only.
--   * See and be seen: the other person's exact point is returned only while
--     the caller is sharing too. It is returned unrounded.
--   * A block closes it both ways; silence (15 min) and expiry hide a point.
--   * Stop, leaving the room, and a sabbatical delete the caller's point.
--   * Nobody reads or writes the table directly.

begin;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ea01', 'ava-exact@example.com'),
  ('00000000-0000-0000-0000-00000000eb02', 'ben-exact@example.com'),
  ('00000000-0000-0000-0000-00000000ec03', 'cara-exact@example.com'),
  ('00000000-0000-0000-0000-00000000ed04', 'dan-exact@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000ea01', 'Ava', true),
  ('00000000-0000-0000-0000-00000000eb02', 'Ben', true),
  ('00000000-0000-0000-0000-00000000ec03', 'Cara', true),
  ('00000000-0000-0000-0000-00000000ed04', 'Dan', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- M: Ava and Ben's match room. G: a group room with both of them in it.
-- O: Ava and Dan's moment room.
insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-0000000e0a01', 'match', 'Ava + Ben', '00000000-0000-0000-0000-00000000ea01'),
  ('00000000-0000-0000-0000-0000000e0a02', 'group', 'Crew', '00000000-0000-0000-0000-00000000ea01'),
  ('00000000-0000-0000-0000-0000000e0a03', 'moment', 'Ava + Dan', '00000000-0000-0000-0000-00000000ea01');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000ea01'),
  ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000eb02'),
  ('00000000-0000-0000-0000-0000000e0a02', '00000000-0000-0000-0000-00000000ea01'),
  ('00000000-0000-0000-0000-0000000e0a02', '00000000-0000-0000-0000-00000000eb02'),
  ('00000000-0000-0000-0000-0000000e0a03', '00000000-0000-0000-0000-00000000ea01'),
  ('00000000-0000-0000-0000-0000000e0a03', '00000000-0000-0000-0000-00000000ed04');

set local role authenticated;

-- ————————————————————————— Ava —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a02', 39.739212, -104.990251, 5, true),
  'not_allowed',
  'a group room never offers exact location'
);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 91, -104.990251, 5, true),
  'invalid',
  'an impossible coordinate is refused'
);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 39.739212, -104.990251, 5, true),
  'shared',
  'a member of a match room can start sharing'
);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 39.739300, -104.990300, 4, false),
  'shared',
  'a move updates an active share'
);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01')),
  1,
  'while Ben is not sharing, Ava sees only her own point'
);

select ok(
  (select is_me from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01')),
  'the point Ava sees is marked as hers'
);

select is(
  (select count(*)::int from public.room_exact_locations),
  0,
  'the table returns nothing when read directly, even your own row'
);

select throws_ok(
  $$ insert into public.room_exact_locations (room_id, user_id, latitude, longitude, expires_at)
     values ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000ea01', 1, 1, now() + interval '9 hours') $$,
  '42501', null,
  'the table cannot be written directly (so no one can extend their own window)'
);

-- ————————————————————————— Ben —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000eb02","role":"authenticated"}', true);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 39.7401, -104.9899, 6, false),
  'not_sharing',
  'a move never starts a share'
);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01')),
  0,
  'see and be seen: Ben cannot see Ava until he shares'
);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 39.7401, -104.9899, 6, true),
  'shared',
  'Ben starts sharing'
);

select is(
  (select latitude from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01') where not is_me),
  39.7393::double precision,
  'once both share, Ben sees Ava''s exact, unrounded point'
);

-- ————————————————————————— Cara, not in the room —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ec03","role":"authenticated"}', true);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 39.7401, -104.9899, 6, true),
  'not_allowed',
  'someone outside the room cannot share into it'
);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01')),
  0,
  'someone outside the room sees nothing'
);

-- ————————————————————————— silence, expiry —————————————————————————
reset role;
update public.room_exact_locations
   set updated_at = now() - interval '20 minutes'
 where user_id = '00000000-0000-0000-0000-00000000eb02';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01') where not is_me),
  0,
  'a point silent for 15 minutes is not shown'
);

reset role;
update public.room_exact_locations
   set updated_at = now(), expires_at = now() - interval '1 minute'
 where user_id = '00000000-0000-0000-0000-00000000eb02';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01') where not is_me),
  0,
  'an expired point is not shown'
);

-- ————————————————————————— a block —————————————————————————
reset role;
update public.room_exact_locations
   set expires_at = now() + interval '30 minutes'
 where user_id = '00000000-0000-0000-0000-00000000eb02';
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000eb02', '00000000-0000-0000-0000-00000000ea01');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01')),
  0,
  'after a block, the blocked person sees nothing'
);

select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a01', 39.7393, -104.9903, 4, false),
  'not_allowed',
  'after a block, the blocked person cannot share'
);

reset role;
select is(
  (select count(*)::int from public.room_exact_locations
    where room_id = '00000000-0000-0000-0000-0000000e0a01'),
  0,
  'a block deletes both people''s points in the rooms they share'
);

delete from public.profile_blocks
 where blocker_id = '00000000-0000-0000-0000-00000000eb02'
   and blocked_id = '00000000-0000-0000-0000-00000000ea01';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ea01","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.exact_locations_in_room('00000000-0000-0000-0000-0000000e0a01')),
  0,
  'unblocking does not bring the old points back: sharing needs a new tap'
);

-- ————————————————————————— a moment room, stop, sabbatical —————————————————————————
select is(
  public.share_exact_location('00000000-0000-0000-0000-0000000e0a03', 39.7393, -104.9903, 4, true),
  'shared',
  'a moment room offers exact location too'
);

select public.stop_exact_location('00000000-0000-0000-0000-0000000e0a03');
reset role;

select is(
  (select count(*)::int from public.room_exact_locations
    where room_id = '00000000-0000-0000-0000-0000000e0a03'),
  0,
  'Stop deletes the point'
);

insert into public.room_exact_locations (room_id, user_id, latitude, longitude, expires_at)
values ('00000000-0000-0000-0000-0000000e0a01', '00000000-0000-0000-0000-00000000eb02', 39.74, -104.99, now() + interval '30 minutes');

delete from public.room_members
 where room_id = '00000000-0000-0000-0000-0000000e0a01'
   and member_id = '00000000-0000-0000-0000-00000000eb02';

select is(
  (select count(*)::int from public.room_exact_locations
    where user_id = '00000000-0000-0000-0000-00000000eb02'),
  0,
  'leaving the room deletes your point in it'
);

insert into public.room_exact_locations (room_id, user_id, latitude, longitude, expires_at)
values ('00000000-0000-0000-0000-0000000e0a03', '00000000-0000-0000-0000-00000000ea01', 39.74, -104.99, now() + interval '30 minutes');

update public.profiles set sabbatical = true
 where id = '00000000-0000-0000-0000-00000000ea01';

select is(
  (select count(*)::int from public.room_exact_locations
    where user_id = '00000000-0000-0000-0000-00000000ea01'),
  0,
  'a sabbatical deletes every exact point you were sharing'
);

select ok(
  not has_function_privilege('anon',
    'public.share_exact_location(uuid, double precision, double precision, double precision, boolean)',
    'EXECUTE'),
  'signed-out visitors cannot call share_exact_location'
);

select * from finish();
rollback;
