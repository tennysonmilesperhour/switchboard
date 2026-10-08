begin;
select plan(12);

select ok((select relrowsecurity from pg_class where oid='public.external_events'::regclass), 'canonical events have RLS');
select ok((select relrowsecurity from pg_class where oid='public.external_event_listings'::regclass), 'source listings have RLS');
select ok((select relrowsecurity from pg_class where oid='public.external_event_submissions'::regclass), 'submissions have RLS');
select ok((select relrowsecurity from pg_class where oid='public.external_event_preferences'::regclass), 'preferences have RLS');
select ok(has_column_privilege('authenticated','public.external_events','title','SELECT'), 'readers can read normalized event fields');
-- Inspect ACL entries directly rather than effective privileges. Supabase's CI
-- test role can inherit platform roles that differ between CLI releases; the
-- browser security contract is the grants made to authenticated and PUBLIC.
select ok(not exists (
  select 1 from pg_attribute a
  cross join lateral aclexplode(a.attacl) acl
  left join pg_roles r on r.oid = acl.grantee
  where a.attrelid = 'public.external_events'::regclass and a.attname = 'dedupe_key'
    and (acl.grantee = 0 or r.rolname = 'authenticated') and acl.privilege_type = 'SELECT'
), 'readers cannot read internal event identity');
select ok(not exists (
  select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl
  left join pg_roles r on r.oid = acl.grantee
  where c.oid = 'public.external_event_listings'::regclass
    and (acl.grantee = 0 or r.rolname = 'authenticated') and acl.privilege_type = 'SELECT'
), 'readers cannot read raw source payloads');
select ok(not exists (
  select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl
  left join pg_roles r on r.oid = acl.grantee
  where c.oid = 'public.event_sources'::regclass
    and (acl.grantee = 0 or r.rolname = 'authenticated') and acl.privilege_type = 'SELECT'
), 'readers cannot read source health');
select ok(not exists (
  select 1 from pg_class c cross join lateral aclexplode(c.relacl) acl
  left join pg_roles r on r.oid = acl.grantee
  where c.oid = 'public.external_events'::regclass
    and (acl.grantee = 0 or r.rolname = 'authenticated') and acl.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
), 'readers cannot rewrite events');
select ok(has_function_privilege('service_role','public.try_claim_external_event_collection(integer)','EXECUTE'), 'service role can claim the collector lease');
select ok(has_function_privilege('service_role','public.finish_external_event_collection(jsonb)','EXECUTE'), 'service role can finish collection');
select ok(not has_function_privilege('authenticated','public.refresh_external_event_catalog()','EXECUTE'), 'readers cannot refresh the catalogue');

select * from finish();
rollback;
