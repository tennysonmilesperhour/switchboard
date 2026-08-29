-- pgTAP coverage for 20260829140000_calendar_subscriptions.sql.
--
-- Two things have to hold. The feed address is a bearer credential — anyone
-- holding it can read the whole calendar — so it must never come back out of
-- the database into a client. And a person's busy times are private in exactly
-- the way event_availability rows are: the group learns how many are free,
-- never who or when.

begin;
select plan(7);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c301', 'cal-ana@example.com'),
  ('00000000-0000-0000-0000-00000000c302', 'cal-ben@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000c301', 'Ana', true),
  ('00000000-0000-0000-0000-00000000c302', 'Ben', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.calendar_subscriptions (user_id, ics_url, source_host, last_status)
  values ('00000000-0000-0000-0000-00000000c301',
          'https://calendar.google.com/calendar/ical/SECRET/basic.ics',
          'calendar.google.com', 'ok');
insert into public.calendar_busy (user_id, slot) values
  ('00000000-0000-0000-0000-00000000c301', '2026-09-02T17:00:00Z');

set local role authenticated;

-- ————————————————————————— act as Ana —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c301","role":"authenticated"}',
  true
);

select results_eq(
  $$ select connected, source_host, last_status from public.calendar_subscription_status() $$,
  $$ values (true, 'calendar.google.com'::text, 'ok'::text) $$,
  'the owner can see that a calendar is connected, and which one'
);

-- The point of the function existing at all: its declared output columns are
-- fixed, and the address is not among them, so no caller can hand the secret to
-- a client by mistake. Checked against the function's own signature rather than
-- the shape of one result, which a row of nulls would satisfy either way.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'calendar_subscription_status'
      and 'ics_url' = any(coalesce(p.proargnames, array[]::text[]))),
  0,
  'the status function has no ics_url among its output columns'
);

select lives_ok(
  $$ insert into public.calendar_busy (user_id, slot)
       values ('00000000-0000-0000-0000-00000000c301', '2026-09-03T17:00:00Z') $$,
  'a person can record their own busy time'
);

-- ————————————————————————— act as Ben —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c302","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.calendar_subscriptions),
  0,
  'nobody else can read the row holding a calendar address'
);

select is(
  (select count(*)::int from public.calendar_busy),
  0,
  'nobody else can read when a person is busy'
);

-- Without `with check`, this would succeed and point Ana's calendar at a feed
-- Ben controls — the hole an UPDATE policy without one always leaves.
select throws_ok(
  $$ insert into public.calendar_subscriptions (user_id, ics_url)
       values ('00000000-0000-0000-0000-00000000c301', 'https://evil.example/feed.ics') $$,
  '42501',
  null,
  'nobody can point someone else''s calendar connection at a feed of their choosing'
);

-- The address is a bearer credential, and the owner's own browser holds an
-- `authenticated` session too. RLS scopes the row but not the column, so
-- without this revoke a client could select its own ics_url straight back out.
select is(
  (select count(*)::int
     from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'calendar_subscriptions'
      and column_name = 'ics_url'
      and grantee in ('authenticated', 'anon')
      and privilege_type = 'SELECT'),
  0,
  'no signed-in session may select the stored calendar address'
);

select * from finish();
rollback;
