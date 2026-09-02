-- Migration history can say a change ran even when its DDL did not. Health must
-- therefore inspect the schema the application actually depends on, not only
-- the bookkeeping table used by `supabase db push`.
--
-- `current` is the newest version recorded in that bookkeeping table rather
-- than a literal pinned here: `/api/health` compares it to the newest migration
-- file the app was built with (`EXPECTED_SCHEMA_VERSION`, held to that file by
-- `src/lib/health.test.ts`), so a migration that ships without being applied
-- shows up as a version mismatch without every migration having to redefine
-- this function. `missing` is the list of objects whose DDL is actually absent.
create or replace function public.app_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_version text;
  missing_objects text[];
begin
  select max(applied.version)
    into current_version
    from supabase_migrations.schema_migrations applied;

  with required_objects(name, present) as (
    values
      (
        'public.profiles.notify_plans',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'profiles'
             and column_name = 'notify_plans'
        )
      ),
      (
        'public.profiles.appearance_custom',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'profiles'
             and column_name = 'appearance_custom'
        )
      ),
      (
        'public.profiles.digest_hour',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'profiles'
             and column_name = 'digest_hour'
        )
      ),
      (
        'public.calendar_subscriptions',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'calendar_subscriptions'
        )
      ),
      (
        'public.calendar_busy',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'calendar_busy'
        )
      ),
      (
        'public.match_dismissals',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'match_dismissals'
        )
      ),
      (
        'public.event_availability',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'event_availability'
        )
      ),
      (
        'public.parental_approvals',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'parental_approvals'
        )
      ),
      (
        'public.event_availability_responses',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'event_availability_responses'
        )
      )
  )
  select coalesce(array_agg(name::text order by name), '{}'::text[])
    into missing_objects
    from required_objects
   where not present;

  return jsonb_build_object(
    'current', current_version,
    'complete', cardinality(missing_objects) = 0,
    'missing', to_jsonb(missing_objects)
  );
end
$$;

revoke all on function public.app_schema_status() from public, anon, authenticated;
grant execute on function public.app_schema_status() to service_role;

-- Keep the legacy scalar probe aligned for older deployments and operator
-- scripts while the structured status is the source of truth.
create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_schema_status()->>'current'
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
