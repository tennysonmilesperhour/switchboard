-- Cron execution state is operational data, not a person's operator consent.
-- Keep it out of public.operator_settings: that table is deliberately keyed by
-- profile and every row in it is an explicit user opt-in.
create table private.operator_sweep_state (
  sweep_name text primary key
    check (sweep_name in ('cascade', 'digest')),
  last_started_at timestamptz,
  last_run_at timestamptz,
  running_until timestamptz,
  last_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(last_counts) = 'object')
);

revoke all on table private.operator_sweep_state
  from public, anon, authenticated, service_role;

comment on table private.operator_sweep_state is
  'Private leases and successful-run heartbeats for service-role cron sweeps.';

-- Atomically claim a short lease for one sweep.
--
-- PostgREST returns its database connection as soon as an RPC finishes, so a
-- session-level pg_try_advisory_lock cannot safely span the JavaScript work. A
-- transaction advisory lock serializes competing claims, and the persisted
-- lease carries that exclusion across the rest of the serverless request. The
-- lease expires after a crashed invocation instead of wedging cron forever.
create or replace function public.try_claim_operator_sweep(
  p_sweep text,
  p_lease_seconds integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
declare
  v_claimed boolean := false;
begin
  if p_sweep not in ('cascade', 'digest') then
    raise exception 'unknown operator sweep: %', p_sweep
      using errcode = '22023';
  end if;
  if p_lease_seconds < 15 or p_lease_seconds > 300 then
    raise exception 'operator sweep lease must be between 15 and 300 seconds'
      using errcode = '22023';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended('switchboard:operator-sweep:' || p_sweep, 0)
  ) then
    return false;
  end if;

  insert into private.operator_sweep_state (sweep_name)
  values (p_sweep)
  on conflict (sweep_name) do nothing;

  update private.operator_sweep_state
     set last_started_at = pg_catalog.clock_timestamp(),
         running_until = pg_catalog.clock_timestamp()
           + p_lease_seconds * interval '1 second'
   where sweep_name = p_sweep
     and (
       running_until is null
       or running_until <= pg_catalog.clock_timestamp()
     )
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.try_claim_operator_sweep(text, integer)
  from public, anon, authenticated;
grant execute on function public.try_claim_operator_sweep(text, integer)
  to service_role;

comment on function public.try_claim_operator_sweep(text, integer) is
  'Service-role-only, nonblocking claim for a cron sweep lease.';

-- A heartbeat means the whole sweep finished. Starting a job is intentionally
-- not enough: health must turn red when an invocation repeatedly times out.
create or replace function public.finish_operator_sweep(
  p_sweep text,
  p_counts jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, private
as $$
begin
  if p_sweep not in ('cascade', 'digest') then
    raise exception 'unknown operator sweep: %', p_sweep
      using errcode = '22023';
  end if;
  if pg_catalog.jsonb_typeof(coalesce(p_counts, '{}'::jsonb)) <> 'object' then
    raise exception 'operator sweep counts must be a JSON object'
      using errcode = '22023';
  end if;

  update private.operator_sweep_state
     set last_run_at = pg_catalog.clock_timestamp(),
         running_until = null,
         last_counts = coalesce(p_counts, '{}'::jsonb)
   where sweep_name = p_sweep
     and running_until is not null;

  if not found then
    raise exception 'operator sweep % has no active lease', p_sweep
      using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.finish_operator_sweep(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finish_operator_sweep(text, jsonb)
  to service_role;

comment on function public.finish_operator_sweep(text, jsonb) is
  'Completes an active cron lease and records its successful heartbeat and counts.';

create or replace function public.operator_sweep_status(p_sweep text)
returns table (
  last_started_at timestamptz,
  last_run_at timestamptz,
  running_until timestamptz,
  last_counts jsonb
)
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select
    state.last_started_at,
    state.last_run_at,
    state.running_until,
    state.last_counts
  from private.operator_sweep_state state
  where state.sweep_name = p_sweep
    and p_sweep in ('cascade', 'digest');
$$;

revoke all on function public.operator_sweep_status(text)
  from public, anon, authenticated;
grant execute on function public.operator_sweep_status(text)
  to service_role;

comment on function public.operator_sweep_status(text) is
  'Service-role-only heartbeat probe for one cron sweep.';
