-- PR #109 landed a migration after the roadmap migration had already been
-- applied to production. Require both histories without rewriting an applied
-- migration file.
create or replace function public.app_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  required_versions constant text[] := array[
    '20260722180000',
    '20260724120000',
    '20260726120000',
    '20260729120000',
    '20260731120000',
    '20260731192027',
    '20260731201812'
  ];
  missing_versions text[];
begin
  select coalesce(array_agg(required.version order by required.version), '{}')
    into missing_versions
    from unnest(required_versions) as required(version)
   where not exists (
     select 1
       from supabase_migrations.schema_migrations applied
      where applied.version = required.version
   );

  return jsonb_build_object(
    'current', '20260731201812',
    'complete', cardinality(missing_versions) = 0,
    'missing', to_jsonb(missing_versions)
  );
end
$$;

revoke all on function public.app_schema_status() from public, anon, authenticated;
grant execute on function public.app_schema_status() to service_role;

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260731201812'::text
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
