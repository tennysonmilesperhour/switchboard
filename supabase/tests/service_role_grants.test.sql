-- Every function the server calls with the service-role client must be
-- executable by the service role.
--
-- This is not a theoretical invariant. `20260713151000_function_grant_hardening`
-- ran `alter default privileges in schema public revoke execute on functions
-- from public`, and in Supabase the service role's EXECUTE on a public function
-- comes from exactly that PUBLIC grant. So the hardening quietly removed the
-- service role's access to two functions the app calls only through
-- `createAdminClient()`:
--
--   is_event_host              — every host-only action. Red E2E since 07-31,
--                                reported to hosts as "Only the host can invite
--                                people to this plan."
--   resolve_parental_approval  — shipped 08-11 granting anon + authenticated,
--                                never service_role, and called only as admin.
--
-- Neither failed at migration time, because migrations do not run as
-- service_role. Both failed for real people. This test is the thing that would
-- have caught them the day they landed.
--
-- **Adding a `createAdminClient()` RPC means adding it here.** The list is the
-- contract; keep it in step with `grep -rn "admin\.rpc(" src/`.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db

begin;

-- One assertion per function, plus the two catch-alls below.
select plan(19);

select ok(
  has_function_privilege('service_role', 'public.is_event_host(uuid, uuid)', 'EXECUTE'),
  'service_role can execute is_event_host (isEventManager — every host-only action)'
);

-- The wrapper is not the whole story, and asserting only the wrapper is how a
-- first attempt at this fix passed pgTAP while the app still got 42501.
-- `public.is_event_host` is SECURITY INVOKER: it runs as its caller and calls
-- `private.is_event_host`, so the caller needs EXECUTE on the body too.
select ok(
  has_function_privilege('service_role', 'private.is_event_host(uuid, uuid)', 'EXECUTE'),
  'service_role can execute the PRIVATE body its invoker wrapper delegates to'
);

select ok(
  has_function_privilege(
    'service_role', 'public.resolve_parental_approval(text, boolean)', 'EXECUTE'),
  'service_role can execute resolve_parental_approval (guardian approval links)'
);

select ok(
  has_function_privilege('service_role', 'public.apply_cascade_updates(uuid, jsonb)', 'EXECUTE'),
  'service_role can execute apply_cascade_updates (the cascade runner)'
);

select ok(
  has_function_privilege('service_role', 'public.consume_rate_limit(text, integer, integer)', 'EXECUTE'),
  'service_role can execute consume_rate_limit (every rate-limited path)'
);

select ok(
  has_function_privilege('service_role', 'public.respond_to_guest_invite(uuid, boolean)', 'EXECUTE'),
  'service_role can execute respond_to_guest_invite (guest RSVP)'
);

select ok(
  has_function_privilege('service_role', 'public.rsvp_via_share_token(uuid, uuid, text, text, boolean)', 'EXECUTE'),
  'service_role can execute rsvp_via_share_token (answering from a share link)'
);

-- Open Table approvals and, since 20260930011000, a guardian's approval both
-- complete somebody else's commitment, so both record the Give Space check
-- through the service-role form.
select ok(
  has_function_privilege('service_role', 'public.note_give_space_overlap_for(uuid, uuid)', 'EXECUTE'),
  'service_role can execute note_give_space_overlap_for (approvals completing a yes)'
);

select ok(
  has_function_privilege('service_role', 'public.rotate_event_share_token(uuid, uuid)', 'EXECUTE'),
  'service_role can execute rotate_event_share_token (replacing an invite link)'
);

select ok(
  has_function_privilege('service_role', 'public.resolve_poll_children(uuid)', 'EXECUTE'),
  'service_role can execute resolve_poll_children (opening follow-up polls)'
);

select ok(
  has_function_privilege('service_role', 'public.app_schema_status()', 'EXECUTE'),
  'service_role can execute app_schema_status (the health check)'
);

select ok(
  has_function_privilege('service_role', 'public.sweep_retention(timestamptz)', 'EXECUTE'),
  'service_role can execute sweep_retention (the retention cron)'
);

select ok(
  has_function_privilege('service_role', 'public.digest_items(uuid)', 'EXECUTE'),
  'service_role can execute digest_items (the notification sweep)'
);

select ok(
  has_function_privilege(
    'service_role', 'public.auth_user_id_by_email(text)', 'EXECUTE'
  ),
  'service_role can resolve canonical auth email ownership for recovery'
);

select ok(
  has_function_privilege(
    'service_role', 'public.try_claim_operator_sweep(text, integer)', 'EXECUTE'),
  'service_role can claim cron sweep leases'
);

select ok(
  has_function_privilege(
    'service_role', 'public.finish_operator_sweep(text, jsonb)', 'EXECUTE'),
  'service_role can write successful cron heartbeats'
);

select ok(
  has_function_privilege(
    'service_role', 'public.operator_sweep_status(text)', 'EXECUTE'),
  'service_role can read cron heartbeats for health'
);

-- The rule the hardening migration left behind, stated once: no function
-- anywhere in `public` may be executable by `anon` while being one of the
-- service-role entry points above. Guards against a future grant that widens
-- one of these back out to the browser in the name of "fixing" it.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'is_event_host', 'apply_cascade_updates', 'consume_rate_limit',
        'respond_to_guest_invite', 'rotate_event_share_token',
        'resolve_poll_children', 'try_claim_operator_sweep',
        'finish_operator_sweep', 'operator_sweep_status', 'sweep_retention'
      )
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'no service-role entry point is reachable by anon'
);

/*
 * The general rule, rather than one assertion per function: every body in
 * `private` exists to be called by a `public` wrapper that runs as its caller,
 * and the server is one of those callers. A body the service role cannot
 * execute is a path that works for a signed-in person and 42501s for the
 * server — the exact shape of the bug this file was written for, and one that
 * no per-function list would have caught for the *next* function moved.
 *
 * `private` stays unreachable from the browser regardless: it is not an
 * exposed PostgREST schema, and `public`/`anon` are revoked from the schema
 * itself (20260717192758).
 */
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and not has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0,
  'every private function body is executable by service_role'
);

select * from finish();
rollback;
