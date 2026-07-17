-- Move authenticated-callable SECURITY DEFINER bodies out of the exposed public
-- API schema. Public RPC names remain stable as SECURITY INVOKER wrappers that
-- delegate to the private implementation.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

do $$
declare
  v_function record;
  v_call_args text;
  v_body text;
begin
  for v_function in
    select
      p.oid,
      p.proname,
      pg_get_function_arguments(p.oid) as arguments,
      pg_get_function_identity_arguments(p.oid) as identity_arguments,
      pg_get_function_result(p.oid) as result_type,
      p.proargnames,
      p.proargmodes,
      p.proretset
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('authenticated', p.oid, 'execute')
    order by p.proname, pg_get_function_identity_arguments(p.oid)
  loop
    select coalesce(string_agg(format('%I', arg_name), ', ' order by ord), '')
    into v_call_args
    from (
      select
        names.ord,
        names.arg_name,
        coalesce(modes.arg_mode, 'i'::"char") as arg_mode
      from unnest(coalesce(v_function.proargnames, array[]::text[]))
        with ordinality as names(arg_name, ord)
      left join unnest(coalesce(v_function.proargmodes, array[]::"char"[]))
        with ordinality as modes(arg_mode, ord)
        on modes.ord = names.ord
    ) args
    where arg_mode in ('i', 'b', 'v')
      and arg_name is not null
      and arg_name <> '';

    execute format(
      'alter function public.%I(%s) set schema private',
      v_function.proname,
      v_function.identity_arguments
    );

    if v_function.result_type = 'trigger' then
      execute format(
        'revoke all on function private.%I(%s) from public, anon, authenticated',
        v_function.proname,
        v_function.identity_arguments
      );
      execute format(
        'grant execute on function private.%I(%s) to service_role',
        v_function.proname,
        v_function.identity_arguments
      );
      continue;
    end if;

    if v_function.proretset then
      v_body := format('select * from private.%I(%s)', v_function.proname, v_call_args);
    else
      v_body := format('select private.%I(%s)', v_function.proname, v_call_args);
    end if;

    execute format(
      'create function public.%I(%s) returns %s language sql security invoker set search_path = '''' as %L',
      v_function.proname,
      v_function.arguments,
      v_function.result_type,
      v_body
    );

    execute format(
      'revoke all on function public.%I(%s) from public, anon',
      v_function.proname,
      v_function.identity_arguments
    );
    execute format(
      'grant execute on function public.%I(%s) to authenticated, service_role',
      v_function.proname,
      v_function.identity_arguments
    );
  end loop;
end;
$$;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260717192758'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
