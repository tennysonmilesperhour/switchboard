-- Versioned contract used by the authenticated readiness endpoint. Keep the
-- returned value synchronized with this migration's filename whenever a later
-- release changes schema required by the running application.

create or replace function public.app_schema_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '20260713150000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
