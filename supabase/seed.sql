-- Local / CI seed (run by `supabase start` and `supabase db reset`; NOT applied
-- to production by `db push`).
--
-- The schema deliberately carries no table-level GRANTs: a hosted Supabase
-- project grants the `anon` / `authenticated` / `service_role` roles access to
-- public tables automatically, and Row-Level Security is the real gate. A bare
-- local stack doesn't reproduce that auto-grant, so without this the roles can't
-- reach the tables at all (`permission denied for table ...`) and the pgTAP
-- suite — which exercises policies as the `authenticated` role — can't run.
-- `service_role` needs it too: the authenticated-E2E seed (e2e/seed.mjs) writes
-- fixtures through the service-role admin client.
--
-- The job here is to make local and CI behave like production. Where a
-- migration has deliberately made production LESS permissive than the hosted
-- default, this file has to leave that alone — a seed that hands back what a
-- migration took away doesn't set up the database, it edits the schema, and it
-- does it in the one place no test is looking.

grant usage on schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- SELECT everywhere EXCEPT public.profiles.
--
-- SB-01 (20260710120000_lock_sensitive_profile_columns.sql) dropped the
-- table-level SELECT grant on profiles and replaced it with an explicit column
-- allowlist, so that `calendar_token` — the bearer credential for the private
-- calendar feed — and the contact columns behind the `contact_public` opt-out
-- are not readable through the API by every signed-in user. A blanket
-- `grant select on all tables` here restores precisely the grant that fix
-- removed, and a table-level privilege covers every column, so the allowlist
-- stops meaning anything.
--
-- That is what this file used to do, and the cost was not theoretical:
--
--   * The pgTAP tests that exist to prove SB-01 holds could not have failed.
--     They ran against a database where the withheld columns were readable.
--   * A profiles column added without joining the allowlist read fine locally
--     and failed with 42501 in production — for the whole query, so the app saw
--     an empty profile rather than a denied column. `appearance_theme` shipped
--     that way (Settings appeared to ignore the theme you picked) and so did
--     `legal_terms_version` (the proxy stopped funnelling half-registered
--     accounts into onboarding). Neither could have been caught by any test on
--     this stack.
--
-- Granting SELECT table by table rather than revoking it afterwards is
-- deliberate: `REVOKE SELECT ON <table>` also drops the column-level SELECT
-- grants on that table, so "blanket grant, then revoke on profiles" would leave
-- profiles unreadable in a way production is not.
do $$
declare
  relation record;
begin
  for relation in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and c.relname <> 'profiles'
  loop
    execute format(
      'grant select on public.%I to anon, authenticated', relation.relname
    );
  end loop;
end $$;

-- service_role mirrors the hosted default (full table access, RLS-exempt).
-- SB-01 revoked from `anon, authenticated` only, so profiles is included here.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
