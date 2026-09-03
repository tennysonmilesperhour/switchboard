-- The guardian token must never be readable by a browser role: a host or
-- co-host who could SELECT it could approve a minor's RSVP as the guardian.

begin;
select plan(7);

select ok(
  not has_table_privilege('authenticated', 'public.parental_approvals', 'SELECT'),
  'authenticated has no table-wide SELECT that bypasses the column allowlist'
);

select ok(
  not has_table_privilege('anon', 'public.parental_approvals', 'SELECT'),
  'anon has no table-wide SELECT that bypasses the column allowlist'
);

select ok(
  not has_column_privilege('authenticated', 'public.parental_approvals', 'token', 'SELECT'),
  'authenticated cannot read parental_approvals.token'
);

select ok(
  not has_column_privilege('anon', 'public.parental_approvals', 'token', 'SELECT'),
  'anon cannot read parental_approvals.token'
);

select ok(
  has_column_privilege('authenticated', 'public.parental_approvals', 'guardian_email', 'SELECT'),
  'authenticated keeps the guardian columns the host UI shows'
);

select ok(
  has_column_privilege('authenticated', 'public.parental_approvals', 'status', 'SELECT'),
  'authenticated keeps the status column'
);

select ok(
  has_column_privilege('service_role', 'public.parental_approvals', 'token', 'SELECT'),
  'service_role still resolves tokens for /approve/<token>'
);

select * from finish();
rollback;
