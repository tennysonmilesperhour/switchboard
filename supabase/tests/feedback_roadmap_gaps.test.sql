-- pgTAP coverage for the feedback-roadmap surfaces added in
-- 20260731192027_complete_feedback_roadmap.sql: the decline-note column on
-- invites and the board_post_responses "I can help" table.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- Convention (mirrors authz_hardening.test.sql): seed as the privileged
-- migration role, then switch to `authenticated` with a specific user's JWT
-- claims to exercise the policies exactly as that user would experience them.

begin;
select plan(10);

-- ————————————————————————— fixtures —————————————————————————
-- alice hosts + moderates; bob is a declined invitee and board member; carol
-- is a board member; dave is not on the board at all.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f201', 'roadmap-alice@example.com'),
  ('00000000-0000-0000-0000-00000000f202', 'roadmap-bob@example.com'),
  ('00000000-0000-0000-0000-00000000f203', 'roadmap-carol@example.com'),
  ('00000000-0000-0000-0000-00000000f204', 'roadmap-dave@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000f201', 'Alice', true),
  ('00000000-0000-0000-0000-00000000f202', 'Bob', true),
  ('00000000-0000-0000-0000-00000000f203', 'Carol', true),
  ('00000000-0000-0000-0000-00000000f204', 'Dave', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Bob already declined Alice's event; his note column starts empty.
insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000e0201', '00000000-0000-0000-0000-00000000f201',
   'Alice picnic', 'inviting');
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-0000000a0201', '00000000-0000-0000-0000-0000000e0201',
   '00000000-0000-0000-0000-00000000f202', 0, 'declined');

-- A board with one open request (Bob's), one fulfilled request, one expired offer.
insert into public.boards (id, slug, name, created_by) values
  ('00000000-0000-0000-0000-00000000b201', 'roadmap-board', 'Roadmap Board',
   '00000000-0000-0000-0000-00000000f201');
insert into public.board_members (board_id, member_id, role) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f201', 'moderator'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f202', 'member'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000f203', 'member');
insert into public.board_posts (id, board_id, author_id, kind, title, fulfilled_at, expires_at) values
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000b201',
   '00000000-0000-0000-0000-00000000f202', 'request', 'Knee scooter for a week?', null, null),
  ('00000000-0000-0000-0000-00000000d202', '00000000-0000-0000-0000-00000000b201',
   '00000000-0000-0000-0000-00000000f201', 'request', 'Ladder (found one!)', now(), null),
  ('00000000-0000-0000-0000-00000000d203', '00000000-0000-0000-0000-00000000b201',
   '00000000-0000-0000-0000-00000000f201', 'offer', 'Moving boxes', null, now() - interval '1 day');

-- ————————————————————————— invites: decline note —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f202","role":"authenticated"}', true);

-- The invitee has no UPDATE path on invites: a direct write is a zero-row
-- no-op. (The app persists the note through the admin client, re-scoped to
-- the caller's own just-declined row.)
-- The data-modifying CTE has to sit at the top level of the statement:
-- Postgres rejects one nested inside a scalar subquery ("WITH clause containing
-- a data-modifying statement must be at the top level"), which aborts the whole
-- file before the plan is met rather than failing a single assertion.
with changed as (
  update public.invites
     set decline_message = 'writing straight to the table'
   where id = '00000000-0000-0000-0000-0000000a0201'
  returning id
)
select is(
  count(*)::int,
  0,
  'invitee cannot update their invite row directly (no invitee UPDATE policy)'
)
from changed;

-- ————————————————————————— board responses —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f203","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.board_post_responses (post_id, responder_id) values
     ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000f203') $$,
  'a board member can respond to another member''s open request'
);

select throws_ok(
  $$ insert into public.board_post_responses (post_id, responder_id) values
     ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000f204') $$,
  '42501',
  null,
  'a responder cannot forge someone else''s responder_id'
);

select throws_ok(
  $$ insert into public.board_post_responses (post_id, responder_id) values
     ('00000000-0000-0000-0000-00000000d202', '00000000-0000-0000-0000-00000000f203') $$,
  '42501',
  null,
  'no responding to an already-fulfilled post'
);

select throws_ok(
  $$ insert into public.board_post_responses (post_id, responder_id) values
     ('00000000-0000-0000-0000-00000000d203', '00000000-0000-0000-0000-00000000f203') $$,
  '42501',
  null,
  'no responding to an expired listing'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f202","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.board_post_responses (post_id, responder_id) values
     ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000f202') $$,
  '42501',
  null,
  'an author cannot respond to their own post'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f204","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.board_post_responses (post_id, responder_id) values
     ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000f204') $$,
  '42501',
  null,
  'a non-member cannot respond at all'
);
select is(
  (select count(*)::int from public.board_post_responses
    where post_id = '00000000-0000-0000-0000-00000000d201'),
  0,
  'a non-member cannot read responses'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000f203","role":"authenticated"}', true);
with removed as (
  delete from public.board_post_responses
   where post_id = '00000000-0000-0000-0000-00000000d201'
     and responder_id = '00000000-0000-0000-0000-00000000f203'
  returning post_id
)
select is(count(*)::int, 1, 'a responder can withdraw their own response')
from removed;

-- ————————————————————————— constraint: note length —————————————————————————
reset role;
select throws_ok(
  format(
    $$ update public.invites set decline_message = %L
       where id = '00000000-0000-0000-0000-0000000a0201' $$,
    repeat('x', 281)
  ),
  '23514',
  null,
  'decline_message is capped at 280 characters'
);

select * from finish();
rollback;
