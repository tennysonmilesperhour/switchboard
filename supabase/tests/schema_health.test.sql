-- pgTAP coverage for 20260902015913_schema_health_checks.sql.
--
-- Migration history is bookkeeping, not proof that the schema exists. Rename
-- each required object inside a savepoint to prove the health function detects
-- the real absence by its operator-facing name.

begin;
select plan(22);

select is(
  public.app_schema_status()->>'current',
  (select max(version) from supabase_migrations.schema_migrations),
  'health reports the newest applied migration as the current version'
);

select is(
  public.app_schema_version(),
  public.app_schema_status()->>'current',
  'the legacy scalar schema version stays aligned with structured health'
);

select is(
  (public.app_schema_status()->>'complete')::boolean,
  true,
  'a fully migrated database reports complete schema health'
);

select is(
  public.app_schema_status()->'missing',
  '[]'::jsonb,
  'a fully migrated database reports no missing schema objects'
);

alter table public.profiles
  rename column notify_plans to health_missing_notify_plans;
select ok(
  (public.app_schema_status()->'missing') ? 'public.profiles.notify_plans',
  'health names a missing profiles.notify_plans column'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing profiles.notify_plans column makes health incomplete'
);
alter table public.profiles
  rename column health_missing_notify_plans to notify_plans;

alter table public.profiles
  rename column appearance_custom to health_missing_appearance_custom;
select ok(
  (public.app_schema_status()->'missing') ? 'public.profiles.appearance_custom',
  'health names a missing profiles.appearance_custom column'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing profiles.appearance_custom column makes health incomplete'
);
alter table public.profiles
  rename column health_missing_appearance_custom to appearance_custom;

alter table public.profiles
  rename column digest_hour to health_missing_digest_hour;
select ok(
  (public.app_schema_status()->'missing') ? 'public.profiles.digest_hour',
  'health names a missing profiles.digest_hour column'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing profiles.digest_hour column makes health incomplete'
);
alter table public.profiles
  rename column health_missing_digest_hour to digest_hour;

alter table public.calendar_subscriptions
  rename to health_missing_calendar_subscriptions;
select ok(
  (public.app_schema_status()->'missing') ? 'public.calendar_subscriptions',
  'health names a missing calendar_subscriptions table'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing calendar_subscriptions table makes health incomplete'
);
alter table public.health_missing_calendar_subscriptions
  rename to calendar_subscriptions;

alter table public.calendar_busy rename to health_missing_calendar_busy;
select ok(
  (public.app_schema_status()->'missing') ? 'public.calendar_busy',
  'health names a missing calendar_busy table'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing calendar_busy table makes health incomplete'
);
alter table public.health_missing_calendar_busy rename to calendar_busy;

alter table public.match_dismissals rename to health_missing_match_dismissals;
select ok(
  (public.app_schema_status()->'missing') ? 'public.match_dismissals',
  'health names a missing match_dismissals table'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing match_dismissals table makes health incomplete'
);
alter table public.health_missing_match_dismissals rename to match_dismissals;

alter table public.event_availability
  rename to health_missing_event_availability;
select ok(
  (public.app_schema_status()->'missing') ? 'public.event_availability',
  'health names a missing event_availability table'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing event_availability table makes health incomplete'
);
alter table public.health_missing_event_availability
  rename to event_availability;

alter table public.parental_approvals rename to health_missing_parental_approvals;
select ok(
  (public.app_schema_status()->'missing') ? 'public.parental_approvals',
  'health names a missing parental_approvals table'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing parental_approvals table makes health incomplete'
);
alter table public.health_missing_parental_approvals rename to parental_approvals;

alter table public.event_availability_responses
  rename to health_missing_availability_responses;
select ok(
  (public.app_schema_status()->'missing')
    ? 'public.event_availability_responses',
  'health names a missing event_availability_responses table'
);
select is(
  (public.app_schema_status()->>'complete')::boolean,
  false,
  'a missing event_availability_responses table makes health incomplete'
);
alter table public.health_missing_availability_responses
  rename to event_availability_responses;

select * from finish();
rollback;
