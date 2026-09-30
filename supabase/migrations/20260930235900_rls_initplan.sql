-- Evaluate auth.uid() once per statement in every public policy, not once per
-- row.
--
-- A bare `auth.uid()` in a policy expression is re-evaluated for each row the
-- policy is checked against. Wrapped as `(select auth.uid())` the planner turns
-- it into an initplan that runs once per statement, which is what Supabase's
-- `auth_rls_initplan` advisor flagged on 119 public policies. The value is the
-- same, so no policy changes what it allows.
--
-- This walks pg_policies rather than restating 119 policies by hand, so it
-- also covers every policy added earlier in the same release, and it cannot
-- drift from what the earlier migrations actually created. Calls that are
-- already wrapped (the deparser prints them as `( SELECT auth.uid() AS uid)`)
-- are left alone. `supabase/tests/rls_initplan.test.sql` keeps new policies
-- from reintroducing the bare form.

do $$
declare
  v_policy record;
  v_using text;
  v_check text;
begin
  for v_policy in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)'
        or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)'
      )
  loop
    v_using := regexp_replace(v_policy.qual, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    v_check := regexp_replace(v_policy.with_check, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');

    if v_using is not null and v_check is not null then
      execute format(
        'alter policy %I on public.%I using (%s) with check (%s)',
        v_policy.policyname, v_policy.tablename, v_using, v_check
      );
    elsif v_using is not null then
      execute format(
        'alter policy %I on public.%I using (%s)',
        v_policy.policyname, v_policy.tablename, v_using
      );
    else
      execute format(
        'alter policy %I on public.%I with check (%s)',
        v_policy.policyname, v_policy.tablename, v_check
      );
    end if;
  end loop;
end
$$;
