-- Leaving a zone check-in is always allowed.
--
-- `enforce_zone_checkin_access` (20260812120000_private_zones.sql) guards every
-- INSERT and UPDATE on `moments`, so it also refused the one write that only
-- ever shrinks a zone's presence: closing a moment. Two things broke:
--
--   - Someone removed from a private zone could not check out of a moment
--     they had opened there while they were still a member. The Check out
--     button failed, and the moment stayed counted until it expired.
--   - It never expired. The retention sweep (`src/lib/server/cleanup.ts`)
--     closes every lapsed moment in one UPDATE, and a single row belonging to
--     a removed member raised inside it, so the whole statement rolled back
--     and no expired moment anywhere was closed.
--
-- The gate exists to stop a non-member being counted in a zone's presence. A
-- close, with the zone left as it was, can only take someone out of that count,
-- so it is exempt. Every other write still passes the check: a removed member
-- cannot extend or reopen a moment in a zone they are no longer part of.

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
  return new;
end $$;
