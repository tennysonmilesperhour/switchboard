-- One permissive policy per table, role and command (Q3).
--
-- Supabase's `multiple_permissive_policies` advisor flagged four tables where
-- an owner's FOR ALL policy and a second SELECT policy both applied to reads.
-- Postgres evaluates every permissive policy for every row and ORs them, so
-- each read paid for both. Each FOR ALL policy is split into its three write
-- commands, and the two read rules become one SELECT policy that ORs them.
-- What each person may read or write does not change.
--
-- The write policy keeps its old name on INSERT, which is where the rules the
-- code and docs cite live (`event_cohosts_host` requires an eligible co-host,
-- `household_members_owner` requires a connection). `signals_visible` keeps its
-- name as the one audience rule, now also covering your own signals.
--
-- Like the policy rewrite that follows, this reads each expression from
-- pg_policies instead of restating it, so it cannot drift from what earlier
-- migrations created, and it stops if a policy is not where it is expected.
-- `supabase/tests/single_permissive_policies.test.sql` keeps a second
-- permissive policy from coming back on any table.

do $$
declare
  v_pair record;
  v_using text;
  v_check text;
  v_read text;
begin
  for v_pair in
    select *
    from (values
      ('availability_signals', 'signals_own', 'signals_visible', 'signals_visible'),
      ('event_cohosts', 'event_cohosts_host', 'event_cohosts_self_select', 'event_cohosts_select'),
      ('households', 'households_owner', 'households_member_select', 'households_select'),
      ('household_members', 'household_members_owner', 'household_members_self_select', 'household_members_select')
    ) as t(table_name, write_policy, read_policy, merged_read)
  loop
    select qual, with_check into v_using, v_check
    from pg_policies
    where schemaname = 'public'
      and tablename = v_pair.table_name
      and policyname = v_pair.write_policy
      and cmd = 'ALL'
      and roles = '{authenticated}';
    select qual into v_read
    from pg_policies
    where schemaname = 'public'
      and tablename = v_pair.table_name
      and policyname = v_pair.read_policy
      and cmd = 'SELECT'
      and roles = '{authenticated}';
    if v_using is null or v_read is null then
      raise exception 'expected policies %.% and %.% were not found',
        v_pair.table_name, v_pair.write_policy, v_pair.table_name, v_pair.read_policy;
    end if;
    -- A FOR ALL policy with no WITH CHECK checks new rows with its USING.
    v_check := coalesce(v_check, v_using);

    execute format('drop policy %I on public.%I', v_pair.write_policy, v_pair.table_name);
    execute format('drop policy %I on public.%I', v_pair.read_policy, v_pair.table_name);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (%s)',
      v_pair.write_policy, v_pair.table_name, v_check
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
      v_pair.write_policy || '_update', v_pair.table_name, v_using, v_check
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (%s)',
      v_pair.write_policy || '_delete', v_pair.table_name, v_using
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using ((%s) or (%s))',
      v_pair.merged_read, v_pair.table_name, v_using, v_read
    );
  end loop;
end
$$;
