-- Zone presence: how many OTHER people are currently open to a shared moment in
-- a zone.
--
-- The zone page has always said "N people are currently open to a shared moment
-- here", counted straight off `moments` through the reader's own RLS client. But
-- `moments_own` (20260703120000_init.sql) is owner-only —
-- `using (user_id = auth.uid())` — so that count could only ever be the reader's
-- OWN check-ins. A zone with six people in it reads "Be the first to check in";
-- a zone with nobody but you reads "1 person is currently open to a shared
-- moment here", which is the app describing you to yourself in the third person.
-- The one surface whose entire job is to say "someone else is here too" was
-- structurally unable to ever say it, and no amount of demo data would have
-- changed that.
--
-- Cross-user exposure follows the precedent set by find_nearby_people
-- (20260718120000_live_location.sql, docs/SECURITY.md §"Live location"): the raw
-- rows stay owner-only under RLS, and the single thing that crosses the boundary
-- goes through a SECURITY DEFINER body in the private schema behind a thin
-- public SECURITY INVOKER wrapper (the convention from
-- 20260717192758_move_definer_bodies_private.sql).
--
-- What crosses is a COUNT and nothing else — no id, no display name, no
-- headline, no coordinate, no experience list. Checking into a zone is an opt-in
-- announcement of presence to whoever else is in that zone (zones are
-- world-readable by design: `zones_select using (true)`), and a bare integer is
-- the narrowest possible form of that announcement. Identities at a place still
-- require mutual exposure through find_shared_moments, which is unchanged.
--
-- Blocks are honoured, exactly as find_nearby_people honours them. Avoids
-- deliberately are NOT: "warn, never remove" is the rule Give Space is built on
-- (20260711120500_profile_avoids.sql), and silently shrinking a count is
-- removal. Nor does this annotate an avoid on a location surface, which
-- docs/SECURITY.md §"Give Space safety invariant" forbids — it returns an
-- integer and cannot annotate anything.

create or replace function private.zone_presence(p_zone uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  -- `is distinct from` rather than `<>` so a null auth.uid() (service role) is
  -- treated as "nobody", not as a null comparison that swallows every row.
  select count(*)::integer
  from public.moments m
  where m.zone_id = p_zone
    and m.status = 'open'
    and m.available_until > now()
    and m.user_id is distinct from auth.uid()
    and not public.are_blocked(auth.uid(), m.user_id);
$$;

revoke all on function private.zone_presence(uuid) from public, anon;
grant execute on function private.zone_presence(uuid) to authenticated, service_role;

create or replace function public.zone_presence(p_zone uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.zone_presence(p_zone);
$$;

revoke all on function public.zone_presence(uuid) from public, anon;
grant execute on function public.zone_presence(uuid) to authenticated, service_role;
