-- Post-level reporting: the rules that stop the report table lying.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db

begin;
select plan(7);

-- Two neighbours and a board with one post.
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'author@example.test'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'reporter@example.test')
on conflict do nothing;
insert into public.profiles (id, display_name, handle) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Author', 'postauthor'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'Reporter', 'postreporter')
on conflict do nothing;

insert into public.boards (id, name, slug, owner_id)
values ('bbbbbbbb-0000-4000-8000-000000000001', 'Test Board', 'test-board-reports',
        'aaaaaaaa-0000-4000-8000-000000000001');

insert into public.board_posts (id, board_id, author_id, title, body)
values ('cccccccc-0000-4000-8000-000000000001',
        'bbbbbbbb-0000-4000-8000-000000000001',
        'aaaaaaaa-0000-4000-8000-000000000001',
        'A post', 'Body text');

-- 1. The default is unchanged, so every report written before this migration
--    is still a profile report and nothing had to be backfilled.
select is(
  (select target_kind from public.user_reports limit 0),
  null,
  'the table accepts the new columns'
);

set local role postgres;

-- 2. A post report records which post.
insert into public.user_reports (reporter_id, reported_id, reason, target_kind, target_id)
values ('aaaaaaaa-0000-4000-8000-000000000002',
        'aaaaaaaa-0000-4000-8000-000000000001',
        'Spam', 'board_post', 'cccccccc-0000-4000-8000-000000000001');
select is(
  (select target_id from public.user_reports
    where reporter_id = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'cccccccc-0000-4000-8000-000000000001'::uuid,
  'a post report names the post'
);

-- 3. The same person cannot file the same post report twice — the queue should
--    show one grievance once, not however many times someone tapped.
select throws_ok(
  $$insert into public.user_reports (reporter_id, reported_id, reason, target_kind, target_id)
    values ('aaaaaaaa-0000-4000-8000-000000000002',
            'aaaaaaaa-0000-4000-8000-000000000001',
            'Spam again', 'board_post', 'cccccccc-0000-4000-8000-000000000001')$$,
  '23505', null,
  'the same reporter cannot file the same post twice'
);

-- 4. A post report with no post is a profile report wearing the wrong label.
select throws_ok(
  $$insert into public.user_reports (reporter_id, reported_id, reason, target_kind)
    values ('aaaaaaaa-0000-4000-8000-000000000002',
            'aaaaaaaa-0000-4000-8000-000000000001',
            'No target', 'board_post')$$,
  '23514', null,
  'target_kind board_post requires a target_id'
);

-- 5. ...and a profile report carrying a post id is ambiguous about what was
--    actually being flagged.
select throws_ok(
  $$insert into public.user_reports (reporter_id, reported_id, reason, target_kind, target_id)
    values ('aaaaaaaa-0000-4000-8000-000000000002',
            'aaaaaaaa-0000-4000-8000-000000000001',
            'Confused', 'profile', 'cccccccc-0000-4000-8000-000000000001')$$,
  '23514', null,
  'a profile report may not carry a post id'
);

-- 6. Deleting the post takes its report with it. A queue entry pointing at
--    nothing is worse than no entry: it cannot be judged and cannot be closed.
delete from public.board_posts where id = 'cccccccc-0000-4000-8000-000000000001';
select is(
  (select count(*)::int from public.user_reports
    where target_kind = 'board_post'),
  0,
  'removing the post removes the report about it'
);

-- 7. The moderator door stays shut to everyone else. `list_open_reports` is
--    security definer and self-checks membership, so a non-moderator calling it
--    gets an empty set rather than the queue.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-4000-8000-000000000002"}';
select is(
  (select count(*)::int from public.list_open_reports()),
  0,
  'a non-moderator sees no reports, post-level or otherwise'
);

select * from finish();
rollback;
