-- pgTAP coverage for 20260929150000_advisor_hygiene.sql.

begin;
select plan(8);

select ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'freeze_event_share_token'
      and p.proconfig @> array['search_path=public']
  ),
  'freeze_event_share_token has a fixed search_path'
);

select ok(
  not has_function_privilege('anon', 'public.ensure_board_invite_code(uuid)', 'execute'),
  'anon cannot execute ensure_board_invite_code'
);
select ok(
  not has_function_privilege('anon', 'public.rotate_board_invite_code(uuid)', 'execute'),
  'anon cannot execute rotate_board_invite_code'
);
select ok(
  not has_function_privilege('anon', 'public.join_board_via_code(text)', 'execute'),
  'anon cannot execute join_board_via_code'
);

-- Positive controls: the signed-in paths the app uses still work.
select ok(
  has_function_privilege('authenticated', 'public.ensure_board_invite_code(uuid)', 'execute'),
  'authenticated can still execute ensure_board_invite_code'
);
select ok(
  has_function_privilege('authenticated', 'public.rotate_board_invite_code(uuid)', 'execute'),
  'authenticated can still execute rotate_board_invite_code'
);
select ok(
  has_function_privilege('authenticated', 'public.join_board_via_code(text)', 'execute'),
  'authenticated can still execute join_board_via_code'
);

select is(
  (select count(*)::int from pg_indexes
    where schemaname = 'public'
      and tablename = 'messages'
      and indexname in ('messages_room_created_idx', 'messages_room_latest_idx')),
  1,
  'messages keeps exactly one (room_id, created_at desc) index'
);

select * from finish();
rollback;
