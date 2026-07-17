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
-- fixtures through the service-role admin client. These grants make the local/CI
-- database behave like production; RLS still governs every row (service_role
-- bypasses RLS in production exactly as it does here).
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- service_role mirrors the hosted default (full table access, RLS-exempt).
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
