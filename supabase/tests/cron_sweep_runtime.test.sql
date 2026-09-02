-- Cron is a service-role operator path. The state stays private, claims are
-- exclusive, and only a completed run becomes a health heartbeat.
begin;

select plan(17);

select has_table(
  'private',
  'operator_sweep_state',
  'cron runtime state is separate from per-user operator consent'
);
select has_function(
  'public',
  'try_claim_operator_sweep',
  array['text', 'integer'],
  'cron lease claim RPC exists'
);
select has_function(
  'public',
  'finish_operator_sweep',
  array['text', 'jsonb'],
  'cron heartbeat completion RPC exists'
);
select has_function(
  'public',
  'operator_sweep_status',
  array['text'],
  'cron heartbeat status RPC exists'
);

select function_privs_are(
  'public', 'try_claim_operator_sweep', array['text', 'integer'],
  'service_role', array['EXECUTE'],
  'service role can claim a cron sweep'
);
select function_privs_are(
  'public', 'finish_operator_sweep', array['text', 'jsonb'],
  'service_role', array['EXECUTE'],
  'service role can finish a cron sweep'
);
select function_privs_are(
  'public', 'operator_sweep_status', array['text'],
  'service_role', array['EXECUTE'],
  'service role can read cron status'
);
select function_privs_are(
  'public', 'try_claim_operator_sweep', array['text', 'integer'],
  'anon', array[]::text[],
  'anonymous callers cannot claim cron work'
);
select function_privs_are(
  'public', 'finish_operator_sweep', array['text', 'jsonb'],
  'anon', array[]::text[],
  'anonymous callers cannot forge a cron heartbeat'
);
select function_privs_are(
  'public', 'operator_sweep_status', array['text'],
  'authenticated', array[]::text[],
  'signed-in callers cannot inspect operator runtime state'
);

set local role service_role;

select ok(
  public.try_claim_operator_sweep('cascade', 90),
  'the first invocation claims the cascade sweep'
);
select is(
  public.try_claim_operator_sweep('cascade', 90),
  false,
  'a second invocation exits while the first lease is active'
);
select lives_ok(
  $$ select public.finish_operator_sweep(
       'cascade',
       '{"eventsAdvanced":3,"pollsResolved":2}'::jsonb
     ) $$,
  'the owner can complete the sweep'
);
select is(
  (select last_counts->>'eventsAdvanced'
     from public.operator_sweep_status('cascade')),
  '3',
  'completion records the run counts'
);
select ok(
  (select last_run_at is not null
     from public.operator_sweep_status('cascade')),
  'completion records a successful-run heartbeat'
);
select ok(
  (select running_until is null
     from public.operator_sweep_status('cascade')),
  'completion releases the persisted lease'
);
select ok(
  public.try_claim_operator_sweep('cascade', 90),
  'the next invocation can claim after completion'
);

select * from finish();
rollback;
