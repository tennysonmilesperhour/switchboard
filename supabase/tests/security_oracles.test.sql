-- Browser roles may ask self-scoped authorization questions, but may not use
-- policy helpers to probe relationships or privileges for arbitrary accounts.

begin;
select plan(9);

insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000001', 'canonical@example.com');

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'are_blocked', 'are_connected', 'is_event_host',
        'is_board_member', 'is_board_moderator', 'is_room_member',
        'is_zone_member', 'is_zone_moderator', 'can_view_event',
        'can_view_zone', 'is_platform_moderator'
      ])
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  0,
  'authenticated cannot execute arbitrary-user authorization oracles'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'is_blocked_with', 'is_connected_with',
        'is_current_user_event_host', 'is_current_user_board_member',
        'is_current_user_board_moderator', 'is_current_user_room_member',
        'can_current_user_view_event', 'is_current_user_zone_member',
        'is_current_user_zone_moderator', 'can_current_user_view_zone',
        'is_current_user_platform_moderator'
      ])
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ),
  11,
  'authenticated can execute every self-scoped authorization helper'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'is_blocked_with', 'is_connected_with',
        'is_current_user_event_host', 'is_current_user_board_member',
        'is_current_user_board_moderator', 'is_current_user_room_member',
        'can_current_user_view_event', 'is_current_user_zone_member',
        'is_current_user_zone_moderator', 'can_current_user_view_zone',
        'is_current_user_platform_moderator'
      ])
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'anonymous cannot execute self-scoped authorization helpers'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.digest_items(uuid)', 'EXECUTE'
  ),
  'authenticated cannot execute the notification digest primitive'
);

select ok(
  has_function_privilege('service_role', 'public.digest_items(uuid)', 'EXECUTE'),
  'service_role retains notification digest access'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.auth_user_id_by_email(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.auth_user_id_by_email(text)', 'EXECUTE'
  ),
  'browser roles cannot query canonical auth email ownership'
);

select is(
  (
    select count(*)::int
    from pg_depend d
    join pg_policy policy on policy.oid = d.objid
      and d.classid = 'pg_policy'::regclass
    join pg_proc p on p.oid = d.refobjid
      and d.refclassid = 'pg_proc'::regclass
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'are_blocked', 'are_connected', 'is_event_host',
        'is_board_member', 'is_board_moderator', 'is_room_member',
        'is_zone_member', 'is_zone_moderator', 'can_view_event',
        'can_view_zone', 'is_platform_moderator'
      ])
  ),
  0,
  'RLS policies depend only on unexposed authorization helpers'
);

select ok(
  not has_schema_privilege('anon', 'private', 'USAGE'),
  'anonymous cannot address the private policy-helper schema'
);

set local role service_role;
select is(
  public.auth_user_id_by_email('  CANONICAL@example.com '),
  '30000000-0000-0000-0000-000000000001'::uuid,
  'the service primitive resolves an exact canonical auth email'
);
reset role;

select * from finish();
rollback;
