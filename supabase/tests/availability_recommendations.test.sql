-- pgTAP coverage for 20260901224943_availability_recommendations.sql.
--
-- A recommendation is honest only if "answered none" differs from "has not
-- answered". These assertions also prove the two writes are atomic and that
-- callers cannot bypass the RPC's seven-day grid validation.

begin;
select plan(16);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a401', 'free-ana@example.com'),
  ('00000000-0000-0000-0000-00000000a402', 'free-ben@example.com'),
  ('00000000-0000-0000-0000-00000000a403', 'free-cy@example.com'),
  ('00000000-0000-0000-0000-00000000a404', 'free-outsider@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a401', 'Ana', true),
  ('00000000-0000-0000-0000-00000000a402', 'Ben', true),
  ('00000000-0000-0000-0000-00000000a403', 'Cy', true),
  ('00000000-0000-0000-0000-00000000a404', 'Outsider', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-00000000b401',
   '00000000-0000-0000-0000-00000000a401',
   'Find a time',
   'deciding');

insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-00000000c401',
   '00000000-0000-0000-0000-00000000b401',
   '00000000-0000-0000-0000-00000000a402', 1, 'queued'),
  ('00000000-0000-0000-0000-00000000c402',
   '00000000-0000-0000-0000-00000000b401',
   '00000000-0000-0000-0000-00000000a403', 2, 'queued');

select ok(
  has_function_privilege(
    'authenticated',
    'public.replace_event_availability(uuid, timestamptz[])',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.event_availability_summary(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon',
    'public.replace_event_availability(uuid, timestamptz[])',
    'EXECUTE'
  )
  and not has_table_privilege('authenticated', 'public.event_availability', 'INSERT')
  and not has_table_privilege(
    'authenticated',
    'public.event_availability_responses',
    'INSERT'
  ),
  'authenticated callers get only the two aggregate/atomic RPC doors'
);

set local role authenticated;

-- ————————————————————————— act as Ana, the host —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a401","role":"authenticated"}',
  true
);

select results_eq(
  $$ select responders, eligible_people
       from public.event_availability_summary(
         '00000000-0000-0000-0000-00000000b401'
       ) $$,
  $$ values (0, 3) $$,
  'the host and two deciding-stage invitees are eligible before anyone answers'
);

select throws_ok(
  $$ insert into public.event_availability (event_id, user_id, slot)
       values (
         '00000000-0000-0000-0000-00000000b401',
         '00000000-0000-0000-0000-00000000a401',
         timezone(
           'UTC',
           date_trunc('day', timezone('UTC', statement_timestamp()))
             + interval '1 day 17 hours'
         )
       ) $$,
  '42501',
  null,
  'direct slot writes cannot bypass the atomic RPC'
);

select lives_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000b401',
       array[
         timezone(
           'UTC',
           date_trunc('day', timezone('UTC', statement_timestamp()))
             + interval '1 day 17 hours'
         ),
         timezone(
           'UTC',
           date_trunc('day', timezone('UTC', statement_timestamp()))
             + interval '1 day 17 hours'
         )
       ]
     ) $$,
  'the host can submit offered slots'
);

select is(
  (select count(*)::int from public.event_availability),
  1,
  'duplicate slots collapse into one answer row'
);

select results_eq(
  $$ select responders, eligible_people
       from public.event_availability_summary(
         '00000000-0000-0000-0000-00000000b401'
       ) $$,
  $$ values (1, 3) $$,
  'submitting slots records one respondent'
);

select lives_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000b401',
       '{}'::timestamptz[]
     ) $$,
  'none of these times is a valid answer'
);

select is(
  (select count(*)::int from public.event_availability),
  0,
  'an empty answer clears the person''s old slot rows'
);

select results_eq(
  $$ select responders, eligible_people
       from public.event_availability_summary(
         '00000000-0000-0000-0000-00000000b401'
       ) $$,
  $$ values (1, 3) $$,
  'answered none remains distinguishable from never answered'
);

select throws_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000b401',
       array[
         timezone(
           'UTC',
           date_trunc('day', timezone('UTC', statement_timestamp()))
             + interval '1 day 17 hours 30 minutes'
         )
       ]
     ) $$,
  '23514',
  'slot is outside the offered availability grid',
  'the RPC refuses a timestamp the grid never offered'
);

select is(
  (select count(*)::int from public.event_availability),
  0,
  'a refused replacement leaves the previous empty answer intact'
);

-- ————————————————————————— act as Ben —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a402","role":"authenticated"}',
  true
);

select lives_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000b401',
       array[
         timezone(
           'UTC',
           date_trunc('day', timezone('UTC', statement_timestamp()))
             + interval '2 days 22 hours'
         )
       ]
     ) $$,
  'a deciding-stage invitee can submit availability'
);

select results_eq(
  $$ select responders, eligible_people
       from public.event_availability_summary(
         '00000000-0000-0000-0000-00000000b401'
       ) $$,
  $$ values (2, 3) $$,
  'participation rises without exposing who answered'
);

select is(
  (select count(*)::int from public.event_availability_responses),
  1,
  'Ben can read only his own response marker, not Ana''s'
);

-- ————————————————————————— act as an outsider —————————————————————————
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a404","role":"authenticated"}',
  true
);

select results_eq(
  $$ select responders, eligible_people
       from public.event_availability_summary(
         '00000000-0000-0000-0000-00000000b401'
       ) $$,
  $$ values (0, 0) $$,
  'an outsider gets no participant-count oracle for the plan'
);

select throws_ok(
  $$ select public.replace_event_availability(
       '00000000-0000-0000-0000-00000000b401',
       '{}'::timestamptz[]
     ) $$,
  '42501',
  'not allowed to answer availability for this plan',
  'an outsider cannot manufacture a response marker'
);

select * from finish();
rollback;
