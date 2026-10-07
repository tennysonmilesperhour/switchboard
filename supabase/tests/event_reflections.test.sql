-- pgTAP coverage for 20261008160000_event_reflections.sql.
-- Reflections are private to their author, cannot be written for someone else,
-- and cannot be re-pointed at another plan or person.

begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000ba11', 'mallory@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a11c', 'Alice', true),
  ('00000000-0000-0000-0000-00000000ba11', 'Mallory', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;
insert into public.events (id, host_id, title, status, starts_at) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000a11c', 'Dinner', 'past', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-00000000a11c', 'Brunch', 'past', now() - interval '4 days');
insert into public.events (id, host_id, title, status, starts_at) values
  ('00000000-0000-0000-0000-0000000e0003', '00000000-0000-0000-0000-00000000ba11', 'Mallory party', 'confirmed', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000e0004', '00000000-0000-0000-0000-00000000a11c', 'Next week', 'confirmed', now() + interval '3 days');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.event_reflections (user_id, event_id, verdict, tags, journal)
    values ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000e0001', 'loved', '{good-food}', 'Great night')$$,
  'a person can reflect on their own plan'
);

select throws_ok(
  $$insert into public.event_reflections (user_id, event_id, verdict)
    values ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000e0002', 'maybe')$$,
  '23514', null, 'an unknown verdict is refused'
);

select throws_ok(
  $$insert into public.event_reflections (user_id, event_id, verdict)
    values ('00000000-0000-0000-0000-00000000ba11', '00000000-0000-0000-0000-0000000e0002', 'liked')$$,
  '42501', null, 'a person cannot write a reflection as someone else'
);

select throws_ok(
  $$insert into public.event_reflections (user_id, event_id, verdict)
    values ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000e0003', 'liked')$$,
  '42501', null, 'a plan the caller took no part in cannot be reflected on'
);

select throws_ok(
  $$insert into public.event_reflections (user_id, event_id, verdict)
    values ('00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-0000000e0004', 'liked')$$,
  '42501', null, 'a plan that has not happened cannot be reflected on'
);

select throws_ok(
  $$update public.event_reflections set event_id = '00000000-0000-0000-0000-0000000e0002'
     where event_id = '00000000-0000-0000-0000-0000000e0001'$$,
  'P0001', null, 'a reflection cannot be re-pointed at another plan'
);

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ba11","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.event_reflections), 0,
  'nobody else can read it'
);

select is_empty(
  $$update public.event_reflections set verdict = 'disliked' returning 1$$,
  'nobody else can change it'
);

select is_empty(
  $$delete from public.event_reflections returning 1$$,
  'nobody else can delete it'
);

select * from finish();
rollback;
