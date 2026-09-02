-- Retention is an operator concern, not a browser capability. Keep the four
-- durable cleanup rules in one service-role-only function so the cron gets one
-- auditable scope and pgTAP can prove exactly which rows it removes.
create or replace function public.sweep_retention(
  p_now timestamptz default now()
)
returns table (
  contact_verification_requests_deleted integer,
  rate_limits_deleted integer,
  notifications_deleted integer,
  moments_deleted integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contact_verification_requests_deleted integer;
  v_rate_limits_deleted integer;
  v_notifications_deleted integer;
  v_moments_deleted integer;
begin
  with removed as (
    delete from public.contact_verification_requests
     where expires_at < p_now
    returning 1
  )
  select count(*)::integer
    into v_contact_verification_requests_deleted
    from removed;

  with removed as (
    delete from public.rate_limits
     where window_started_at < p_now - interval '1 day'
    returning 1
  )
  select count(*)::integer
    into v_rate_limits_deleted
    from removed;

  -- Retain an unread notification regardless of age. For a read row, the
  -- retention clock begins when it was read, so opening an old notification
  -- today cannot make it disappear in the same request.
  with removed as (
    delete from public.notifications
     where read_at < p_now - interval '90 days'
    returning 1
  )
  select count(*)::integer
    into v_notifications_deleted
    from removed;

  -- moments has no closed_at column; available_until is its lifecycle clock.
  -- The status predicate is still mandatory so retention never closes or
  -- removes a live moment by itself.
  with removed as (
    delete from public.moments
     where status = 'closed'
       and available_until < p_now - interval '30 days'
    returning 1
  )
  select count(*)::integer
    into v_moments_deleted
    from removed;

  return query select
    v_contact_verification_requests_deleted,
    v_rate_limits_deleted,
    v_notifications_deleted,
    v_moments_deleted;
end;
$$;

revoke all on function public.sweep_retention(timestamptz)
  from public, anon, authenticated;
grant execute on function public.sweep_retention(timestamptz)
  to service_role;

-- A precise coordinate in an owner-only table is still retained precise data.
-- Coarsen every write in the database, including a direct authenticated client,
-- before the row ever lands. The app action performs the same rounding before
-- issuing its write; this trigger is the non-bypassable boundary.
create or replace function private.coarsen_live_location_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.latitude := round(new.latitude::numeric, 3)::double precision;
  new.longitude := round(new.longitude::numeric, 3)::double precision;
  return new;
end;
$$;

revoke all on function private.coarsen_live_location_write()
  from public, anon, authenticated;
grant execute on function private.coarsen_live_location_write()
  to service_role;

-- Remove precision already retained before installing the write boundary.
update public.live_locations
   set latitude = round(latitude::numeric, 3)::double precision,
       longitude = round(longitude::numeric, 3)::double precision
 where latitude is distinct from round(latitude::numeric, 3)::double precision
    or longitude is distinct from round(longitude::numeric, 3)::double precision;

drop trigger if exists live_locations_coarsen_write on public.live_locations;
create trigger live_locations_coarsen_write
before insert or update of latitude, longitude on public.live_locations
for each row execute function private.coarsen_live_location_write();

-- `private.find_nearby_people` is left exactly as 20260902023519 defined it:
-- it still rounds the caller's and every target's point to three decimals
-- before deriving distance, radius membership, and ordering. On rows written
-- through this trigger that rounding is a no-op, which is the point — the
-- write boundary is the guarantee, and the read-time rounding stays as defence
-- in depth so a future change to this trigger (or a bulk import that skipped
-- it) can never turn the RPC into an exact-position oracle.
