begin;
select plan(12);

select ok((select relrowsecurity from pg_class where oid='public.external_events'::regclass), 'canonical events have RLS');
select ok((select relrowsecurity from pg_class where oid='public.external_event_listings'::regclass), 'source listings have RLS');
select ok((select relrowsecurity from pg_class where oid='public.external_event_submissions'::regclass), 'submissions have RLS');
select ok((select relrowsecurity from pg_class where oid='public.external_event_preferences'::regclass), 'preferences have RLS');
select ok(has_column_privilege('authenticated','public.external_events','title','SELECT'), 'readers can read normalized event fields');
select ok(not has_column_privilege('authenticated','public.external_events','dedupe_key','SELECT'), 'readers cannot read internal event identity');
select ok(not has_table_privilege('authenticated','public.external_event_listings','SELECT'), 'readers cannot read raw source payloads');
select ok(not has_table_privilege('authenticated','public.event_sources','SELECT'), 'readers cannot read source health');
select ok(not has_table_privilege('authenticated','public.external_events','UPDATE'), 'readers cannot rewrite events');
select ok(has_function_privilege('service_role','public.try_claim_external_event_collection(integer)','EXECUTE'), 'service role can claim the collector lease');
select ok(has_function_privilege('service_role','public.finish_external_event_collection(jsonb)','EXECUTE'), 'service role can finish collection');
select ok(not has_function_privilege('authenticated','public.refresh_external_event_catalog()','EXECUTE'), 'readers cannot refresh the catalogue');

select * from finish();
rollback;
