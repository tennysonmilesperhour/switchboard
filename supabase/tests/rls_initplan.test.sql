-- pgTAP coverage for 20260930235900_rls_initplan.sql.
--
-- Every public policy calls auth.uid() through a scalar subquery, so it runs
-- once per statement rather than once per row. A new policy written with a
-- bare auth.uid() fails here: wrap it as (select auth.uid()).

begin;
select plan(2);

select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)'
        or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)'
      )),
  0,
  'no public policy calls auth.uid() once per row'
);

-- Positive control: the rewrite kept the policies that scope rows to the
-- caller, it did not drop them.
select cmp_ok(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public'
      and (
        coalesce(qual, '') ~ 'SELECT auth\.uid\(\)'
        or coalesce(with_check, '') ~ 'SELECT auth\.uid\(\)'
      )),
  '>=',
  100,
  'the caller-scoped policies are still there, now evaluated once per statement'
);

select * from finish();
rollback;
