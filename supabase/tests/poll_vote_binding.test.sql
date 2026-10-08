-- W16: INSERT and UPDATE must bind an option to its own poll.
begin;
select plan(6);
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000001601', 'binding-host@example.com');
insert into public.events(id, host_id, title, status) values
  ('00000000-0000-0000-0000-000000001610', '00000000-0000-0000-0000-000000001601', 'Binding', 'deciding');
insert into public.polls(id, event_id, phase) values
  ('00000000-0000-0000-0000-000000001611', '00000000-0000-0000-0000-000000001610', 'voting'),
  ('00000000-0000-0000-0000-000000001612', '00000000-0000-0000-0000-000000001610', 'voting');
insert into public.poll_options(id, poll_id, label) values
  ('00000000-0000-0000-0000-000000001621', '00000000-0000-0000-0000-000000001611', 'First'),
  ('00000000-0000-0000-0000-000000001622', '00000000-0000-0000-0000-000000001612', 'Other poll');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001601","role":"authenticated"}', true);
select throws_ok($$insert into public.poll_votes(poll_id, option_id, voter_id, weight)
  values ('00000000-0000-0000-0000-000000001611', '00000000-0000-0000-0000-000000001622',
    '00000000-0000-0000-0000-000000001601', 1)$$,
  '42501', null, 'a readable foreign option cannot be inserted into this poll');
select lives_ok($$insert into public.poll_votes(poll_id, option_id, voter_id, weight)
  values ('00000000-0000-0000-0000-000000001611', '00000000-0000-0000-0000-000000001621',
    '00000000-0000-0000-0000-000000001601', 1)$$, 'a matching vote is allowed');
select throws_ok($$update public.poll_votes set option_id = '00000000-0000-0000-0000-000000001622'
  where option_id = '00000000-0000-0000-0000-000000001621'$$,
  '42501', null, 'changing an option cannot cross polls');
select lives_ok($$update public.poll_votes set weight = 2
  where option_id = '00000000-0000-0000-0000-000000001621'$$, 'legitimate reweighting still works');
reset role;
select throws_ok($$insert into public.poll_votes(poll_id, option_id, voter_id, weight)
  values ('00000000-0000-0000-0000-000000001611', '00000000-0000-0000-0000-000000001622',
    '00000000-0000-0000-0000-000000001601', 1)$$,
  '23503', null, 'a composite foreign key also protects privileged writes');
delete from public.poll_options where id = '00000000-0000-0000-0000-000000001621';
select is((select count(*)::int from public.poll_votes where poll_id = '00000000-0000-0000-0000-000000001611'),
  0, 'deleting an option still cascades its ballots');
select * from finish();
rollback;
