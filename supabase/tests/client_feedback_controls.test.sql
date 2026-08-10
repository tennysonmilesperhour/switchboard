-- pgTAP coverage for 20260729120000_client_feedback_controls.sql.

begin;
select plan(4);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c101', 'board-author@example.com'),
  ('00000000-0000-0000-0000-00000000c102', 'board-moderator@example.com'),
  ('00000000-0000-0000-0000-00000000c103', 'board-member@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000c101', 'Author', true),
  ('00000000-0000-0000-0000-00000000c102', 'Moderator', true),
  ('00000000-0000-0000-0000-00000000c103', 'Member', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.boards (id, slug, name, created_by) values
  ('00000000-0000-0000-0000-00000000b101', 'feedback-board', 'Feedback Board',
   '00000000-0000-0000-0000-00000000c101');
insert into public.board_members (board_id, member_id, role) values
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000c101', 'member'),
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000c102', 'moderator'),
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000c103', 'member');
insert into public.board_posts (
  id, board_id, author_id, kind, title, cadence
) values (
  '00000000-0000-0000-0000-00000000d101',
  '00000000-0000-0000-0000-00000000b101',
  '00000000-0000-0000-0000-00000000c101',
  'event', 'Saturday walk', 'Every Saturday'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c101","role":"authenticated"}',
  true
);

select lives_ok(
  $$ update public.board_posts
       set title = 'Sunday walk', cadence = 'Every Sunday', updated_at = now()
     where id = '00000000-0000-0000-0000-00000000d101' $$,
  'board-post author can edit ordinary content'
);

select throws_ok(
  $$ update public.board_posts
       set kind = 'notice'
     where id = '00000000-0000-0000-0000-00000000d101' $$,
  'P0001',
  'board post identity is immutable',
  'board-post author cannot reclassify an existing post'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c102","role":"authenticated"}',
  true
);
-- The data-modifying CTE has to sit at the top level of the statement:
-- Postgres rejects one nested inside a scalar subquery ("WITH clause containing
-- a data-modifying statement must be at the top level"), which aborts the whole
-- file before the plan is met rather than failing a single assertion.
with changed as (
  update public.board_posts
     set title = 'Moderator rewrite'
   where id = '00000000-0000-0000-0000-00000000d101'
  returning id
)
select is(count(*)::int, 0, 'board moderator cannot rewrite another member post')
from changed;

select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c103","role":"authenticated"}',
  true
);
with changed as (
  update public.board_posts
     set title = 'Member rewrite'
   where id = '00000000-0000-0000-0000-00000000d101'
  returning id
)
select is(count(*)::int, 0, 'ordinary board member cannot rewrite another member post')
from changed;

select * from finish();
rollback;
