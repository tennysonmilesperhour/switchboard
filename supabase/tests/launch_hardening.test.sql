begin;
select plan(7);

select has_table('public', 'rate_limits', 'durable rate limit table exists');
select has_function(
  'public',
  'create_event_atomic',
  array['jsonb'],
  'atomic event publication function exists'
);
select has_function(
  'public',
  'consume_rate_limit',
  array['text', 'integer', 'integer'],
  'rate limit function exists'
);

select function_privs_are(
  'public',
  'apply_cascade_updates',
  array['uuid', 'jsonb'],
  'authenticated',
  array[]::text[],
  'authenticated users cannot execute internal cascade persistence'
);
select function_privs_are(
  'public',
  'apply_cascade_updates',
  array['uuid', 'jsonb'],
  'service_role',
  array['EXECUTE'],
  'service role can execute internal cascade persistence'
);
select function_privs_are(
  'public',
  'create_event_atomic',
  array['jsonb'],
  'anon',
  array[]::text[],
  'anonymous users cannot publish events'
);
select function_privs_are(
  'public',
  'create_event_atomic',
  array['jsonb'],
  'authenticated',
  array['EXECUTE'],
  'authenticated users can publish events'
);

select * from finish();
rollback;
