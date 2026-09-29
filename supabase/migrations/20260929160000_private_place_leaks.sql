-- Three places where someone outside a boundary could learn or claim what the
-- boundary exists to protect.

-- ————————————————————— 1. a private zone's headcount —————————————————————
-- `zone_presence` returned the count of people checked into any zone id it was
-- handed. A private zone's id is not a secret: `find_private_zone_by_slug`
-- gives it to anyone holding the address, so a non-member could learn whether
-- anyone was there. docs/SECURITY.md's private-zone litmus test asks exactly
-- that ("…or that anyone is in it?"). Now a zone the caller cannot view counts
-- as nobody.
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
  where public.can_view_zone(p_zone, auth.uid())
    and m.zone_id = p_zone
    and m.status = 'open'
    and m.available_until > now()
    and m.user_id is distinct from auth.uid()
    and not public.are_blocked(auth.uid(), m.user_id);
$$;

-- ————————————————————— 2. shared moments across zones —————————————————————
-- Anonymous matching compared typed place names only. A non-member who checked
-- in under a private zone's name (the trigger stops them joining the zone, not
-- typing its name) saw its members' moments and could ping them, and two
-- zones that happen to share a name, in different cities, matched each other's
-- people. A moment now only matches one in the same zone (or both in none),
-- and a zone moment only for someone who can still view that zone.
create or replace function public.find_shared_moments(p_place text)
returns table (id uuid, experiences text[], headline text)
language sql
stable
security definer
set search_path = public
as $$
  -- `headline` is free text promised only after mutual curiosity. Preserve the
  -- function's established return shape for clients, but never populate that
  -- field on the anonymous discovery surface.
  select m.id, m.experiences, null::text as headline
  from public.moments m
  where lower(m.place_name) = lower(p_place)
    and m.status = 'open'
    and m.available_until > now()
    and m.user_id <> auth.uid()
    and not public.are_blocked(auth.uid(), m.user_id)
    and (m.zone_id is null or public.can_view_zone(m.zone_id, auth.uid()))
    and exists (
      select 1
      from public.moments mine
      where mine.user_id = auth.uid()
        and lower(mine.place_name) = lower(p_place)
        and mine.status = 'open'
        and mine.available_until > now()
        and mine.zone_id is not distinct from m.zone_id
    );
$$;

-- ————————————————————— 3. a verified venue rewritten —————————————————————
-- The owner may edit a venue's descriptive fields, and the freeze trigger kept
-- them out of the review columns. But a verified venue stayed verified after
-- its owner renamed it or changed its perk or link, and the event page shows a
-- verified perk on any plan whose place matches the name. Verifying one real
-- venue and then renaming it to another business reopened the impersonation
-- the review exists to close. A descriptive edit to a verified venue by anyone
-- but a moderator now sends it back to review.
create or replace function public.freeze_venue_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_claimant_cleared_for_delete boolean;
  v_reviewer_cleared_for_delete boolean;
begin
  -- PostgreSQL implements ON DELETE SET NULL as an UPDATE. Permit only the FK
  -- cleanup after the referenced profile has disappeared; caller-driven
  -- authority edits remain forbidden.
  v_claimant_cleared_for_delete :=
    old.claimed_by is not null
    and new.claimed_by is null
    and not exists (
      select 1 from public.profiles p where p.id = old.claimed_by
    );
  v_reviewer_cleared_for_delete :=
    old.reviewed_by is not null
    and new.reviewed_by is null
    and not exists (
      select 1 from public.profiles p where p.id = old.reviewed_by
    );

  if new.claimed_by is distinct from old.claimed_by
     and not v_claimant_cleared_for_delete then
    raise exception 'venue owner is immutable';
  end if;
  if (new.status is distinct from old.status
      or (new.reviewed_by is distinct from old.reviewed_by
          and not v_reviewer_cleared_for_delete)
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note)
     and not private.is_platform_moderator(auth.uid()) then
    raise exception 'venue review state is moderator-only';
  end if;

  -- Checked after the guard above, which judged what the caller asked for:
  -- this reset is the trigger's own write, not theirs.
  if old.status = 'verified'
     and (new.name is distinct from old.name
          or new.area is distinct from old.area
          or new.perk is distinct from old.perk
          or new.url is distinct from old.url)
     and not private.is_platform_moderator(auth.uid()) then
    new.status := 'pending';
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
  end if;
  return new;
end;
$$;
