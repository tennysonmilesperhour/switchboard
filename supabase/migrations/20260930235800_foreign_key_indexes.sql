-- Give every public foreign key a covering index.
--
-- Supabase's `unindexed_foreign_keys` advisor listed 57. Most reference
-- profiles(id), which is how account deletion cascades: without an index each
-- ON DELETE CASCADE / SET NULL scans the whole referencing table. The rest back
-- joins the app makes on every page (poll options by poll, messages by sender,
-- moments by zone).
--
-- Like the policy rewrite that follows it, this walks the catalog instead of
-- listing 57 statements, so it also covers foreign keys added earlier in this
-- release. An index "covers" a key when its leading columns are exactly the
-- key's columns. `supabase/tests/foreign_key_indexes.test.sql` keeps new keys
-- from shipping without one.

do $$
declare
  v_key record;
  v_name text;
begin
  for v_key in
    select
      rel.relname as table_name,
      c.conname,
      array_agg(a.attname order by k.ord) as columns
    from pg_constraint c
    join pg_namespace n on n.oid = c.connamespace and n.nspname = 'public'
    join pg_class rel on rel.oid = c.conrelid
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey
      )
    group by rel.relname, c.conname
  loop
    -- Named after the constraint so it is recognisable, and bounded to
    -- Postgres's 63-byte identifier limit.
    v_name := left(v_key.conname, 55) || '_idx';
    execute format(
      'create index if not exists %I on public.%I (%s)',
      v_name,
      v_key.table_name,
      (select string_agg(format('%I', col), ', ') from unnest(v_key.columns) as col)
    );
  end loop;
end
$$;
