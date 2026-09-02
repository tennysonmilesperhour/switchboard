-- Retention scope: prove the operator sweep deletes only rows beyond each
-- documented lifecycle boundary and cannot be invoked from a browser role.

begin;
select plan(11);

select ok(
  not has_function_privilege(
    'anon', 'public.sweep_retention(timestamptz)', 'EXECUTE'),
  'anonymous callers cannot run the retention sweep'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.sweep_retention(timestamptz)', 'EXECUTE'),
  'signed-in callers cannot run the retention sweep'
);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000002101', 'retention-old@example.com'),
  ('00000000-0000-0000-0000-000000002102', 'retention-keep@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-000000002101', 'Retention Old', true),
  ('00000000-0000-0000-0000-000000002102', 'Retention Keep', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.contact_verification_requests (
  user_id, kind, normalized_value, token_hash, expires_at
) values
  (
    '00000000-0000-0000-0000-000000002101', 'email',
    'old@example.com', 'old-token', '2026-09-02 11:59:59+00'
  ),
  (
    '00000000-0000-0000-0000-000000002102', 'email',
    'keep@example.com', 'fresh-token', '2026-09-02 12:00:01+00'
  );

insert into public.rate_limits (key_hash, attempts, window_started_at) values
  ('retention-old', 1, '2026-09-01 11:59:59+00'),
  ('retention-keep', 1, '2026-09-01 12:00:01+00');

insert into public.notifications (
  id, user_id, kind, title, read_at, created_at
) values
  (
    '00000000-0000-0000-0000-000000002111',
    '00000000-0000-0000-0000-000000002101',
    'retention', 'old and read',
    '2026-06-04 11:59:59+00', '2026-06-01 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000002112',
    '00000000-0000-0000-0000-000000002102',
    'retention', 'recently read',
    '2026-06-04 12:00:01+00', '2026-06-01 12:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000002113',
    '00000000-0000-0000-0000-000000002102',
    'retention', 'old but unread',
    null, '2025-01-01 12:00:00+00'
  );

insert into public.moments (
  id, user_id, place_name, available_until, status, created_at
) values
  (
    '00000000-0000-0000-0000-000000002121',
    '00000000-0000-0000-0000-000000002101',
    'Old closed moment', '2026-08-03 11:59:59+00', 'closed',
    '2026-08-03 10:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000002122',
    '00000000-0000-0000-0000-000000002102',
    'Recent closed moment', '2026-08-03 12:00:01+00', 'closed',
    '2026-08-03 10:00:00+00'
  ),
  (
    '00000000-0000-0000-0000-000000002123',
    '00000000-0000-0000-0000-000000002102',
    'Old open moment', '2026-01-01 12:00:00+00', 'open',
    '2026-01-01 10:00:00+00'
  );

set local role service_role;

select results_eq(
  $$
    select
      contact_verification_requests_deleted,
      rate_limits_deleted,
      notifications_deleted,
      moments_deleted
    from public.sweep_retention('2026-09-02 12:00:00+00')
  $$,
  $$ values (1, 1, 1, 1) $$,
  'the sweep reports one expired row removed from each retention class'
);

select is(
  (select count(*)::integer from public.contact_verification_requests
    where user_id = '00000000-0000-0000-0000-000000002101'),
  0,
  'expired contact verification requests are removed'
);

select is(
  (select count(*)::integer from public.contact_verification_requests
    where user_id = '00000000-0000-0000-0000-000000002102'),
  1,
  'unexpired contact verification requests remain'
);

select is(
  (select count(*)::integer from public.rate_limits
    where key_hash = 'retention-old'),
  0,
  'rate-limit buckets older than one day are removed'
);

select is(
  (select count(*)::integer from public.rate_limits
    where key_hash = 'retention-keep'),
  1,
  'rate-limit buckets inside one day remain'
);

select is(
  (select count(*)::integer from public.notifications
    where id = '00000000-0000-0000-0000-000000002111'),
  0,
  'notifications read more than 90 days ago are removed'
);

select is(
  (select count(*)::integer from public.notifications
    where id in (
      '00000000-0000-0000-0000-000000002112',
      '00000000-0000-0000-0000-000000002113'
    )),
  2,
  'recently read and unread notifications remain'
);

select is(
  (select count(*)::integer from public.moments
    where id = '00000000-0000-0000-0000-000000002121'),
  0,
  'closed moments beyond 30 days are removed'
);

select is(
  (select count(*)::integer from public.moments
    where id in (
      '00000000-0000-0000-0000-000000002122',
      '00000000-0000-0000-0000-000000002123'
    )),
  2,
  'recently closed and open moments remain'
);

select * from finish();
rollback;
