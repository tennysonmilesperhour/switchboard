begin;
select plan(6);

-- Host + one invitee so create_event_atomic has a valid cascade to build.
insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000001', 'q-host@example.com'),
  ('30000000-0000-0000-0000-000000000002', 'q-guest@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('30000000-0000-0000-0000-000000000001', 'Q Host', true),
  ('30000000-0000-0000-0000-000000000002', 'Q Guest', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Publish as the host: create_event_atomic reads auth.uid().
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select ok(
  public.create_event_atomic(jsonb_build_object(
    'title', 'Choice Test',
    'inviteMode', 'individual',
    'invitees', jsonb_build_array(
      jsonb_build_object('profileId', '30000000-0000-0000-0000-000000000002')
    ),
    'questions', jsonb_build_array(
      -- Blanks and surrounding whitespace should be cleaned out; order kept.
      jsonb_build_object(
        'prompt', 'Meal?',
        'required', true,
        'kind', 'choice',
        'options', jsonb_build_array('  Veg  ', 'Meat', '', 'Fish')
      ),
      jsonb_build_object('prompt', 'Notes?', 'kind', 'text'),
      -- A "choice" with only one real option can't be a choice.
      jsonb_build_object(
        'prompt', 'Bad choice',
        'kind', 'choice',
        'options', jsonb_build_array('only one')
      )
    )
  )) is not null,
  'create_event_atomic publishes an event carrying mixed questions'
);

-- Read back as the test superuser (RLS aside), scoped to this host's event.
reset role;

select is(
  (select kind from public.event_questions
     where prompt = 'Meal?'
       and event_id in (
         select id from public.events
         where host_id = '30000000-0000-0000-0000-000000000001')),
  'choice',
  'a choice question with two or more options is stored as a choice'
);
select is(
  (select options from public.event_questions
     where prompt = 'Meal?'
       and event_id in (
         select id from public.events
         where host_id = '30000000-0000-0000-0000-000000000001')),
  array['Veg', 'Meat', 'Fish']::text[],
  'choice options are trimmed, blanks dropped, and order preserved'
);
select is(
  (select kind from public.event_questions
     where prompt = 'Bad choice'
       and event_id in (
         select id from public.events
         where host_id = '30000000-0000-0000-0000-000000000001')),
  'text',
  'a choice with fewer than two real options degrades to free text'
);
select is(
  (select options from public.event_questions
     where prompt = 'Bad choice'
       and event_id in (
         select id from public.events
         where host_id = '30000000-0000-0000-0000-000000000001')),
  '{}'::text[],
  'a degraded choice question keeps no options'
);
select is(
  (select kind from public.event_questions
     where prompt = 'Notes?'
       and event_id in (
         select id from public.events
         where host_id = '30000000-0000-0000-0000-000000000001')),
  'text',
  'a plain question stays free text'
);

select * from finish();
rollback;
