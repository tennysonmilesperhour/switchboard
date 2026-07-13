-- Local / CI seed (run by `supabase start` and `supabase db reset`; NOT applied
-- to production by `db push`).
--
-- The schema deliberately carries no table-level GRANTs: a hosted Supabase
-- project grants the `anon` / `authenticated` roles access to public tables
-- automatically, and Row-Level Security is the real gate. A bare local stack
-- doesn't reproduce that auto-grant, so without this the roles can't reach the
-- tables at all (`permission denied for table ...`) and the pgTAP suite — which
-- exercises policies as the `authenticated` role — can't run. These grants make
-- the local/CI database behave like production; RLS still governs every row.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
