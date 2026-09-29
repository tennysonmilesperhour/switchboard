-- pgTAP coverage for 20260930235800_foreign_key_indexes.sql.
--
-- Every public foreign key has an index whose leading columns are exactly the
-- key's columns. A new foreign key without one fails here: add the index in the
-- same migration.

begin;
select plan(1);

select is(
  (select coalesce(string_agg(c.conname, ', ' order by c.conname), '')
     from pg_constraint c
     join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
    where c.contype = 'f'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey
      )),
  '',
  'every public foreign key has a covering index'
);

select * from finish();
rollback;
