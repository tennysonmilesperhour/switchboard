-- pgTAP coverage for 20260930044000_board_moderators.sql (G39).
--
-- Roles change only through set_board_member_role; a board is never left
-- without a moderator by someone leaving; the founder cannot be pushed out by
-- a co-moderator; and a board whose founder has gone can still be deleted.

begin;
select plan(17);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a101a', 'bm-founder@example.com'),
  ('00000000-0000-0000-0000-0000000a102b', 'bm-first@example.com'),
  ('00000000-0000-0000-0000-0000000a103c', 'bm-second@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000a101a', 'BM Founder', true),
  ('00000000-0000-0000-0000-0000000a102b', 'BM First', true),
  ('00000000-0000-0000-0000-0000000a103c', 'BM Second', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.boards (id, slug, name, created_by) values
  ('00000000-0000-0000-0000-0000000b1001'::uuid, 'bm-maple-street', 'Maple Street',
   '00000000-0000-0000-0000-0000000a101a');
insert into public.board_members (board_id, member_id, role, joined_at) values
  ('00000000-0000-0000-0000-0000000b1001'::uuid, '00000000-0000-0000-0000-0000000a101a',
   'moderator', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000b1001'::uuid, '00000000-0000-0000-0000-0000000a102b',
   'member', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000b1001'::uuid, '00000000-0000-0000-0000-0000000a103c',
   'member', now() - interval '1 day');

set local role authenticated;

-- ————————————————————————— promoting —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a102b","role":"authenticated"}', true);

select is((select name from public.boards where slug = 'bm-maple-street'),
  'Maple Street', 'members can still read safe board columns');
select throws_ok($$select invite_code from public.boards$$,
  '42501', null, 'members cannot read the join capability directly');
select throws_ok($$select public.ensure_board_invite_code('00000000-0000-0000-0000-0000000b1001')$$,
  'not a moderator of this board', 'members cannot obtain it through the RPC either');

select throws_ok(
  $$ select public.set_board_member_role('00000000-0000-0000-0000-0000000b1001'::uuid,
       '00000000-0000-0000-0000-0000000a102b', 'moderator') $$,
  'not a moderator of this board',
  'a member cannot promote anyone, themselves included'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a101a","role":"authenticated"}', true);

select ok(public.ensure_board_invite_code('00000000-0000-0000-0000-0000000b1001') is not null,
  'moderators can still obtain the code through the authorized RPC');

select is(
  public.set_board_member_role('00000000-0000-0000-0000-0000000b1001'::uuid,
    '00000000-0000-0000-0000-0000000a102b', 'moderator'),
  'updated',
  'a moderator can make someone a co-moderator'
);

select is(
  (select role from public.board_members
    where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
      and member_id = '00000000-0000-0000-0000-0000000a102b'),
  'moderator',
  'and the role changes'
);

reset role;
select throws_ok(
  $$ update public.board_members set role = 'moderator'
      where member_id = '00000000-0000-0000-0000-0000000a103c' $$,
  'board roles change only through set_board_member_role()',
  'a role never changes by a direct write, not even a privileged one'
);
set local role authenticated;

-- ————————————————————————— the founder —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a102b","role":"authenticated"}', true);

select is(
  public.set_board_member_role('00000000-0000-0000-0000-0000000b1001'::uuid,
    '00000000-0000-0000-0000-0000000a101a', 'member'),
  'founder',
  'a co-moderator cannot demote the founder'
);

delete from public.board_members
 where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
   and member_id = '00000000-0000-0000-0000-0000000a101a';
select is(
  (select count(*)::int from public.board_members
    where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
      and member_id = '00000000-0000-0000-0000-0000000a101a'),
  1,
  'nor remove them'
);

-- ————————————————————————— the last moderator —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a101a","role":"authenticated"}', true);

select is(
  public.set_board_member_role('00000000-0000-0000-0000-0000000b1001'::uuid,
    '00000000-0000-0000-0000-0000000a102b', 'member'),
  'updated',
  'a moderator can step a co-moderator back down'
);

select is(
  public.set_board_member_role('00000000-0000-0000-0000-0000000b1001'::uuid,
    '00000000-0000-0000-0000-0000000a101a', 'member'),
  'last_moderator',
  'the last moderator cannot step down'
);

select throws_ok(
  $$ delete from public.board_members
      where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
        and member_id = '00000000-0000-0000-0000-0000000a101a' $$,
  'last moderator',
  'nor leave, which would orphan the board'
);

select is(
  public.set_board_member_role('00000000-0000-0000-0000-0000000b1001'::uuid,
    '00000000-0000-0000-0000-0000000a102b', 'moderator'),
  'updated',
  'handing it on first'
);

select lives_ok(
  $$ delete from public.board_members
      where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
        and member_id = '00000000-0000-0000-0000-0000000a101a' $$,
  'lets the founder leave'
);

-- ————————————————————————— an exit nobody can refuse —————————————————————————
-- As an account deletion would: no caller, the last moderator's row goes.
reset role;
select set_config('request.jwt.claims', '', true);
delete from public.board_members
 where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
   and member_id = '00000000-0000-0000-0000-0000000a102b';

select is(
  (select role from public.board_members
    where board_id = '00000000-0000-0000-0000-0000000b1001'::uuid
      and member_id = '00000000-0000-0000-0000-0000000a103c'),
  'moderator',
  'losing the last moderator promotes the longest-standing member'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a103c","role":"authenticated"}', true);

-- RLS filters a refused delete to zero rows rather than raising, so the proof
-- is that the board is actually gone.
delete from public.boards where id = '00000000-0000-0000-0000-0000000b1001'::uuid;
reset role;
select is(
  (select count(*)::int from public.boards
    where id = '00000000-0000-0000-0000-0000000b1001'::uuid),
  0,
  'once the founder has left, a moderator can delete the board'
);

select * from finish();
rollback;
