-- Zones end (G38, D23).
--
-- /zones listed the 20 newest public zones in the world under "Active zones",
-- whether they were a festival that ended in July or on another continent.
-- `zones.ends_at` has existed since 20260703200000_innovations.sql and nothing
-- ever set or read it.
--
-- D23: the organizer sets an end date, seven days out by default; zones are
-- found by search and "near me" rather than by recency.
--
--   - Every zone has an end. Existing zones get a week from now, so nothing an
--     organizer is using disappears overnight and every organizer can see and
--     move the date before it does.
--   - Nobody checks into a zone that has ended. The existing check-in gate
--     (`enforce_zone_checkin_access`) refuses a new check-in; closing one is
--     still always allowed (20260929120000_moment_zone_checkout.sql).
--   - Deleting a zone closes the check-ins still open in it. `moments.zone_id`
--     is ON DELETE SET NULL, so an open zone check-in used to become a zone-less
--     one — and start matching strangers by its typed name or its location,
--     which nobody who checked into a private zone agreed to.

update public.zones
   set ends_at = now() + interval '7 days'
 where ends_at is null;

alter table public.zones
  alter column ends_at set default (now() + interval '7 days');
alter table public.zones
  alter column ends_at set not null;

-- A zone cannot end before it starts. NOT VALID so an old row that already
-- breaks it cannot block this migration; every new write is checked.
alter table public.zones
  drop constraint if exists zones_ends_after_start;
alter table public.zones
  add constraint zones_ends_after_start
  check (starts_at is null or ends_at > starts_at) not valid;

create index if not exists zones_active_idx
  on public.zones (ends_at desc)
  where visibility = 'public';

create or replace function public.enforce_zone_checkin_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE'
     and new.status = 'closed'
     and new.zone_id is not distinct from old.zone_id then
    return new;
  end if;

  if new.zone_id is not null
     and not public.can_view_zone(new.zone_id, new.user_id) then
    raise exception 'cannot check into a zone you are not part of';
  end if;

  -- A new check-in only. Updates to a live one (a match claiming it, a claim
  -- being handed back) must keep working through the zone's last hours.
  if tg_op = 'INSERT'
     and new.zone_id is not null
     and exists (
       select 1 from public.zones z
       where z.id = new.zone_id and z.ends_at <= now()
     ) then
    raise exception 'this zone has ended';
  end if;
  return new;
end $$;

create or replace function private.close_zone_moments_on_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.moments m
     set status = 'closed'
   where m.zone_id = old.id
     and m.status = 'open';
  return old;
end;
$$;

revoke all on function private.close_zone_moments_on_delete() from public, anon, authenticated;
grant execute on function private.close_zone_moments_on_delete() to service_role;

drop trigger if exists zones_close_moments_on_delete on public.zones;
create trigger zones_close_moments_on_delete
  before delete on public.zones
  for each row execute function private.close_zone_moments_on_delete();

-- Home's "Around" card offered the Around tab when a zone was pinned within
-- 50 km of home, including zones that ended months ago. Only a zone still on
-- counts, the same test the check-in trigger above uses.
create or replace function private.home_around_available()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      exists (
        select 1
        from public.zones z
        where z.latitude is not null
          and z.longitude is not null
          and z.ends_at > now()
          and public.can_view_zone(z.id, me.id)
          and private.coarse_distance_m(
            me.home_latitude, me.home_longitude, z.latitude, z.longitude
          ) <= 50000
      )
      or exists (
        select 1
        from public.live_locations ll
        where ll.user_id <> me.id
          and ll.expires_at > now()
          and not public.are_blocked(me.id, ll.user_id)
          and (
            ll.visibility = 'sharers'
            or (
              ll.visibility = 'connections'
              and public.are_connected(me.id, ll.user_id)
            )
          )
          and private.coarse_distance_m(
            me.home_latitude, me.home_longitude, ll.latitude, ll.longitude
          ) <= 50000
      )
    from public.profiles me
    where me.id = auth.uid()
      and me.home_latitude is not null
      and me.home_longitude is not null
  ), false);
$$;
