-- Remove anonymous execution from privileged helpers. Application RPCs retain
-- explicit authenticated grants; trigger-only and guest-token functions do
-- not become directly callable by signed-in users.

alter function public.normalize_phone_number(text) set search_path = '';

do $$
declare
  v_function regprocedure;
  v_names text[] := array[
    'approve_join_request',
    'are_connected',
    'bump_poll_tally',
    'can_access_event_thread',
    'can_view_event',
    'check_mutual_match',
    'create_board',
    'find_shared_moments',
    'handle_new_user',
    'is_board_member',
    'is_board_moderator',
    'is_event_host',
    'is_room_member',
    'list_open_tables',
    'my_matchmaker_proposals',
    'poll_results',
    'request_to_join',
    'respond_to_guest_invite',
    'respond_to_invite',
    'respond_to_matchmaker'
  ];
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(v_names)
  loop
    execute format('revoke execute on function %s from public, anon', v_function);
  end loop;
end;
$$;

do $$
declare
  v_function regprocedure;
  v_names text[] := array[
    'approve_join_request',
    'are_connected',
    'can_access_event_thread',
    'can_view_event',
    'check_mutual_match',
    'create_board',
    'find_shared_moments',
    'is_board_member',
    'is_board_moderator',
    'is_event_host',
    'is_room_member',
    'list_open_tables',
    'my_matchmaker_proposals',
    'poll_results',
    'request_to_join',
    'respond_to_invite',
    'respond_to_matchmaker'
  ];
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = any(v_names)
  loop
    execute format('grant execute on function %s to authenticated', v_function);
  end loop;
end;
$$;

-- Trigger/service-role entry points are never direct client RPCs.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.bump_poll_tally() from authenticated;
revoke execute on function public.respond_to_guest_invite(uuid, boolean) from authenticated;

-- New functions start private and must opt into a client role deliberately.
alter default privileges in schema public revoke execute on functions from public;

create or replace function public.app_schema_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '20260713151000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
