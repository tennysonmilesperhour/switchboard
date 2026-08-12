-- Let the service role execute the private function bodies its wrappers call.
--
-- `20260717192758_move_definer_bodies_private.sql` moved every authenticated
-- `SECURITY DEFINER` body out of the exposed `public` API schema into `private`,
-- and left a thin `SECURITY INVOKER` wrapper behind:
--
--     public.is_event_host(uuid, uuid)   -- security INVOKER
--       └─ select private.is_event_host(...)   -- security DEFINER, the real body
--
-- The wrapper was granted to `authenticated, service_role`. The body was not.
-- `alter function ... set schema private` carries the function's existing ACL
-- with it, so each private body kept the `authenticated` grant it already had
-- and never gained one for `service_role` — only the five *trigger* functions
-- got an explicit `grant ... to service_role`, because that branch of the loop
-- said so.
--
-- A `SECURITY INVOKER` wrapper runs as its caller, so the caller needs EXECUTE
-- on what it calls. That split the world in two:
--
--   authenticated → wrapper runs as authenticated → body allows it   → works
--   service_role  → wrapper runs as service_role  → body denies it   → 42501
--
-- Which is why nothing looked broken except the handful of paths that go
-- through `createAdminClient()`, and why the failure reads
-- `permission denied for function is_event_host` — a message that names the
-- wrapper and the body identically, so it points at neither.
--
-- What it cost: every host-only action behind `isEventManager` (inviting
-- directly, cascade edits, closing a poll, announcements) told hosts
-- "Only the host can invite people to this plan." from 2026-07-17 onward, and
-- the authenticated E2E suite has been red since the invite journey was added
-- on 07-31. Separately, `resolve_parental_approval` shipped on 08-11 granting
-- `anon` and `authenticated` but never `service_role`, and is only ever called
-- with the admin client — a guardian following an approval link could not
-- approve.
--
-- Proven from the CI server log, not inferred:
--   {"area":"authz.event-manager","userCode":"SB-PLAN-AUTHZ",
--    "message":"permission denied for function is_event_host","code":"42501"}
--
-- Least privilege holds. `private` is not in PostgREST's exposed schemas and
-- `public`/`anon` were revoked from both the schema and its functions by the
-- migration above; this widens nothing to the browser. `service_role` is the
-- server itself, already past RLS by definition — it is the one role that must
-- be able to run these.

do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and not has_function_privilege('service_role', p.oid, 'execute')
  loop
    execute format(
      'grant execute on function %s to service_role',
      v_function.signature
    );
  end loop;
end;
$$;

-- Shipped 08-11 with grants to `anon` and `authenticated` only, and called
-- exclusively through the admin client. Not part of the private-body move —
-- it simply never listed the role that calls it.
grant execute on function public.resolve_parental_approval(text, boolean) to service_role;

-- The standing rule this leaves behind, asserted by
-- `supabase/tests/service_role_grants.test.sql`: anything reachable through
-- `createAdminClient()` must be executable by `service_role` — including, for a
-- `SECURITY INVOKER` wrapper, the private body it delegates to.
