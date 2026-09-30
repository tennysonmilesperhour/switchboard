-- pgTAP coverage for 20260930050000_availability_plan_zone.sql.
--
-- The availability grid offers the plan's own seven days, not Greenwich's. A
-- slot is still a label (UTC date = the plan's date, UTC hour = the band), so
-- these assertions build each label from the plan's calendar date.
--
-- Two plans at the extremes make the test meaningful at any hour it runs: a
-- UTC+14 plan's today is Greenwich's tomorrow from 10:00 UTC on, and a UTC-11
-- plan's today is Greenwich's yesterday until 11:00 UTC, so at every moment at
-- least one of them disagrees with a Greenwich week.

begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d501', 'zone-host@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000d501', 'Zone host', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status, time_zone) values
  ('00000000-0000-0000-0000-00000000e501',
   '00000000-0000-0000-0000-00000000d501', 'Kiritimati plan', 'deciding', 'Pacific/Kiritimati'),
  ('00000000-0000-0000-0000-00000000e502',
   '00000000-0000-0000-0000-00000000d501', 'Pago Pago plan', 'deciding', 'Pacific/Pago_Pago'),
  ('00000000-0000-0000-0000-00000000e503',
   '00000000-0000-0000-0000-00000000d501', 'Unknown zone plan', 'deciding', 'Not/AZone');

-- ————————————————————————— the door itself —————————————————————————
select is(
  (select p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'replace_event_availability'),
  false,
  'the public door is a thin invoker wrapper'
);

select is(
  (select p.prosecdef
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.proname = 'replace_event_availability'),
  true,
  'the body runs as definer in private'
);

select ok(
  has_function_privilege('authenticated', 'public.replace_event_availability(uuid, timestamptz[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.replace_event_availability(uuid, timestamptz[])', 'EXECUTE')
  and not has_function_privilege('anon', 'private.replace_event_availability(uuid, timestamptz[])', 'EXECUTE'),
  'signed-in people can answer; anonymous callers cannot reach either function'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d501","role":"authenticated"}',
  true
);

-- ————————————————————————— UTC+14 —————————————————————————
select lives_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e501',
       array[
         (((statement_timestamp() at time zone 'Pacific/Kiritimati')::date) + time '17:00')
           at time zone 'UTC',
         (((statement_timestamp() at time zone 'Pacific/Kiritimati')::date + 6) + time '22:00')
           at time zone 'UTC'
       ]
     ) $$,
  'a UTC+14 plan offers its own today through the sixth day after'
);

select throws_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e501',
       array[
         (((statement_timestamp() at time zone 'Pacific/Kiritimati')::date + 7) + time '08:00')
           at time zone 'UTC'
       ]
     ) $$,
  '23514',
  'slot is outside the offered availability grid',
  'a UTC+14 plan does not offer an eighth day'
);

select throws_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e501',
       array[
         (((statement_timestamp() at time zone 'Pacific/Kiritimati')::date - 1) + time '22:00')
           at time zone 'UTC'
       ]
     ) $$,
  '23514',
  'slot is outside the offered availability grid',
  'a UTC+14 plan does not offer the day before its today'
);

-- ————————————————————————— UTC-11 —————————————————————————
select lives_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e502',
       array[
         (((statement_timestamp() at time zone 'Pacific/Pago_Pago')::date) + time '22:00')
           at time zone 'UTC',
         (((statement_timestamp() at time zone 'Pacific/Pago_Pago')::date + 6) + time '08:00')
           at time zone 'UTC'
       ]
     ) $$,
  'a UTC-11 plan still offers tonight after Greenwich has moved on'
);

select throws_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e502',
       array[
         (((statement_timestamp() at time zone 'Pacific/Pago_Pago')::date + 7) + time '12:00')
           at time zone 'UTC'
       ]
     ) $$,
  '23514',
  'slot is outside the offered availability grid',
  'a UTC-11 plan does not offer an eighth day'
);

select throws_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e502',
       array[
         (((statement_timestamp() at time zone 'Pacific/Pago_Pago')::date) + time '19:00')
           at time zone 'UTC'
       ]
     ) $$,
  '23514',
  'slot is outside the offered availability grid',
  'a time that is not a band start is still refused'
);

-- ————————————————————————— unknown zone —————————————————————————
select lives_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000e503',
       array[
         (((statement_timestamp() at time zone 'UTC')::date) + time '12:00') at time zone 'UTC'
       ]
     ) $$,
  'a plan whose zone Postgres does not know falls back to a UTC week instead of failing'
);

select is(
  (select count(*)::int from public.event_availability
    where event_id in (
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e502',
      '00000000-0000-0000-0000-00000000e503')),
  5,
  'only the accepted answers were stored'
);

select * from finish();
rollback;
