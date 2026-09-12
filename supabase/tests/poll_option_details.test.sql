-- pgTAP coverage for 20260912120000_poll_option_details.sql.
--
-- An idea's author or the plan's host may edit or remove it while the poll is
-- open; another guest may not; nobody may once the poll is decided; and no
-- update may re-attribute the idea to someone else.

begin;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e057', 'poll-host@example.com'),
  ('00000000-0000-0000-0000-00000000e0a1', 'poll-author@example.com'),
  ('00000000-0000-0000-0000-00000000e0b2', 'poll-guest@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000e057', 'Host', true),
  ('00000000-0000-0000-0000-00000000e0a1', 'Author', true),
  ('00000000-0000-0000-0000-00000000e0b2', 'Guest', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-00000000e0e0', '00000000-0000-0000-0000-00000000e057', 'Weekend?', 'deciding');
insert into public.polls (id, event_id, phase, allow_suggestions) values
  ('00000000-0000-0000-0000-00000000e0b0', '00000000-0000-0000-0000-00000000e0e0', 'suggesting', true);
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-00000000e0a0', '00000000-0000-0000-0000-00000000e0e0', '00000000-0000-0000-0000-00000000e0a1', 0, 'accepted'),
  ('00000000-0000-0000-0000-00000000e0b1', '00000000-0000-0000-0000-00000000e0e0', '00000000-0000-0000-0000-00000000e0b2', 1, 'accepted');

set local role authenticated;

-- ————————————————————————— the author suggests an idea ——————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}', true);

insert into public.poll_options (id, poll_id, label)
  values ('00000000-0000-0000-0000-00000000e001', '00000000-0000-0000-0000-00000000e0b0', 'Geek festival');

select is(
  (select author_id from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  '00000000-0000-0000-0000-00000000e0a1'::uuid,
  'an idea is attributed to the signed-in person who suggested it'
);

select throws_ok(
  $$ insert into public.poll_options (poll_id, label, author_id)
       values ('00000000-0000-0000-0000-00000000e0b0', 'Forged',
               '00000000-0000-0000-0000-00000000e057') $$,
  '42501',
  null,
  'an idea cannot be attributed to someone else'
);

update public.poll_options
  set label = 'Greek festival', link_url = 'https://example.com/greek', updated_at = now()
  where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select label from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  'Greek festival',
  'the author can correct their own idea'
);

select throws_ok(
  $$ update public.poll_options
       set link_url = 'javascript:alert(1)'
       where id = '00000000-0000-0000-0000-00000000e001' $$,
  '23514',
  null,
  'a link must be a web address'
);

select throws_ok(
  $$ update public.poll_options
       set author_id = '00000000-0000-0000-0000-00000000e0b2'
       where id = '00000000-0000-0000-0000-00000000e001' $$,
  'poll option identity is immutable',
  'an idea cannot be re-attributed'
);

-- ————————————————————————— another guest ————————————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0b2","role":"authenticated"}', true);

update public.poll_options
  set label = 'Vandalised'
  where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select label from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  'Greek festival',
  'another guest cannot edit someone else''s idea'
);

delete from public.poll_options where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select count(*)::int from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  1,
  'another guest cannot remove someone else''s idea'
);

-- ————————————————————————— the host ——————————————————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e057","role":"authenticated"}', true);

update public.poll_options
  set detail = 'Sunday afternoon, in the park'
  where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select detail from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  'Sunday afternoon, in the park',
  'the host can edit any idea'
);

-- ————————————————————————— decided polls are closed ———————————————————————
reset role;
update public.polls set phase = 'decided', winning_option_id = '00000000-0000-0000-0000-00000000e001'
  where id = '00000000-0000-0000-0000-00000000e0b0';
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}', true);
update public.poll_options
  set label = 'Too late'
  where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select label from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  'Greek festival',
  'the author cannot edit an idea once the poll is decided'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e057","role":"authenticated"}', true);
delete from public.poll_options where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select count(*)::int from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  1,
  'the host cannot remove an idea once the poll is decided'
);

-- ————————————————————————— the author removes their own idea —————————————
reset role;
update public.polls set phase = 'voting', winning_option_id = null
  where id = '00000000-0000-0000-0000-00000000e0b0';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e0a1","role":"authenticated"}', true);
delete from public.poll_options where id = '00000000-0000-0000-0000-00000000e001';
select is(
  (select count(*)::int from public.poll_options where id = '00000000-0000-0000-0000-00000000e001'),
  0,
  'the author can remove their own idea while the poll is open'
);

select * from finish();
rollback;
