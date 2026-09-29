-- Households: members can be edited after creation, and only ever to the
-- owner's connections (P9; D9).
--
-- `createHousehold` already filtered the picked ids down to accepted
-- connections before inserting (SB-20: nobody is filed into a group without a
-- relationship to its owner), but that rule lived only in the server action.
-- `household_members_owner` let an owner insert any profile id straight through
-- the API. Now that members can be added after creation there are two writers,
-- so the rule moves to the boundary both of them pass through. Removal is not
-- restricted: taking someone out never needs a connection.
--
-- The two tables' policies also read each other: `household_members_owner`
-- looked up `households`, whose `households_member_select` looked up
-- `household_members`, so any read or write on either table failed with
-- "infinite recursion detected in policy". No household was ever saved. Each
-- side now asks a definer helper that reads the other table without RLS.

create or replace function private.owns_household(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.households h
    where h.id = p_household and h.owner_id = (select auth.uid())
  );
$$;

create or replace function private.in_household(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = p_household and hm.member_id = (select auth.uid())
  );
$$;

revoke all on function private.owns_household(uuid), private.in_household(uuid)
  from public, anon;
-- Policies run as the caller, so the helpers must be executable by them.
grant execute on function private.owns_household(uuid), private.in_household(uuid)
  to authenticated, service_role;

alter policy households_member_select on public.households
  using (private.in_household(id));

alter policy household_members_owner on public.household_members
  using (private.owns_household(household_id))
  with check (
    private.owns_household(household_id)
    and private.are_connected((select auth.uid()), member_id)
  );
