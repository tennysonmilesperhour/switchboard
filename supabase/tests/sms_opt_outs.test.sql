begin;
select plan(13);

select has_table('public', 'sms_opt_outs', 'SMS opt-outs have a durable table');
select col_is_pk(
  'public', 'sms_opt_outs', 'normalized_number',
  'the normalized phone number is the opt-out key'
);
select col_type_is(
  'public', 'sms_opt_outs', 'opted_out_at', 'timestamp with time zone',
  'the opt-out timestamp is timezone-aware'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.sms_opt_outs'::regclass),
  'sms_opt_outs has RLS enabled'
);
select ok(
  (select relforcerowsecurity from pg_class where oid = 'public.sms_opt_outs'::regclass),
  'sms_opt_outs forces RLS for non-bypass owners'
);
select ok(
  not has_table_privilege('anon', 'public.sms_opt_outs', 'SELECT'),
  'anonymous clients cannot read phone suppressions'
);
select ok(
  not has_table_privilege('authenticated', 'public.sms_opt_outs', 'SELECT'),
  'signed-in clients cannot read phone suppressions'
);
select ok(
  not has_table_privilege('authenticated', 'public.sms_opt_outs', 'INSERT'),
  'signed-in clients cannot forge phone suppressions'
);
select ok(
  has_table_privilege('service_role', 'public.sms_opt_outs', 'SELECT,INSERT,UPDATE,DELETE'),
  'the webhook and send guard can manage suppressions as service_role'
);
set local role service_role;
select lives_ok(
  $$ insert into public.sms_opt_outs (normalized_number) values ('+15555550100') $$,
  'service_role can write a normalized suppression through the table constraint'
);
select is(
  (select count(*)::int from public.sms_opt_outs),
  1,
  'service_role can read the suppression it wrote'
);
reset role;
select throws_ok(
  $$ insert into public.sms_opt_outs (normalized_number) values ('15555550100') $$,
  '23514',
  null,
  'the table rejects a phone number that is not normalized E.164'
);
select matches(
  (
    select pg_get_constraintdef(oid)
    from pg_constraint
    where conname = 'invite_delivery_attempts_status_check'
  ),
  'opted_out',
  'delivery evidence records an opt-out separately from provider failure'
);

select * from finish();
rollback;
