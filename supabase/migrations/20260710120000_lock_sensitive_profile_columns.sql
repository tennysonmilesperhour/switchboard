-- SB-01  Sensitive profile columns were world-readable to any signed-in user.
--
-- profiles_select is `using (true)` (init.sql:396), which — combined with the
-- default table-level SELECT grant PostgREST gives the `authenticated` role —
-- let any logged-in user read EVERY column of EVERY profile straight through
-- the API. That exposed:
--   * calendar_token — the sole bearer credential for the private calendar
--     feed (api/calendar/[token]). Harvest all tokens, read everyone's whole
--     schedule (titles, locations, times) with no further auth.
--   * contact_email / contact_phone / contact_phone_normalized — leaked
--     regardless of the `contact_public` opt-out, which is only ever honored in
--     app code, never at the database.
--
-- RLS is row-level and cannot restrict columns, and a bare column REVOKE is a
-- no-op while a table-level SELECT grant exists. So the fix is to drop the
-- table-level SELECT grant and re-grant SELECT on only the non-sensitive
-- columns, then hand owners their own private values through a security-definer
-- accessor. Row visibility is still governed by the existing profiles_select
-- policy; this only removes the four sensitive columns from the API surface.
--
-- NOTE for future migrations: because this replaces the table-level grant with
-- an explicit column grant, a newly added profiles column is NOT readable by
-- anon/authenticated until it is added to the grant list below (fail-closed).

revoke select on public.profiles from anon, authenticated;

grant select (
  id,
  display_name,
  handle,
  avatar_url,
  bio,
  interests,
  quiet_hours_start,
  quiet_hours_end,
  timezone,
  onboarded,
  created_at,
  down_to,
  sabbatical,
  sabbatical_message,
  cover_url,
  tagline,
  pronouns,
  location,
  links,
  socials,
  contact_public,
  discoverable,
  discovery_geography,
  discovery_demographics,
  discovery_interests,
  discovery_involvements,
  discovery_mutuals,
  discovery_contexts
) on public.profiles to anon, authenticated;

-- Owners still need their own calendar token and contact details for the
-- settings and profile pages. A security-definer accessor returns exactly the
-- caller's own withheld columns and nothing else.
create or replace function public.my_private_profile()
returns table (
  calendar_token uuid,
  contact_email text,
  contact_phone text
)
language sql
stable
security definer
set search_path = public
as $$
  select calendar_token, contact_email, contact_phone
  from public.profiles
  where id = auth.uid();
$$;

revoke all on function public.my_private_profile() from public, anon;
grant execute on function public.my_private_profile() to authenticated;
