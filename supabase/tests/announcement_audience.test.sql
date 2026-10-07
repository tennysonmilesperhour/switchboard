-- A room membership left behind after declining must not reveal door codes.
begin;
select plan(10);
insert into auth.users(id, email) values
  ('00000000-0000-0000-0000-000000001801', 'announcement-host@example.com'),
  ('00000000-0000-0000-0000-000000001802', 'announcement-guest@example.com');
insert into public.rooms(id, title, kind, created_by) values
  ('00000000-0000-0000-0000-000000001810', 'Dinner', 'event', '00000000-0000-0000-0000-000000001801');
insert into public.events(id, host_id, title, status, room_id) values
  ('00000000-0000-0000-0000-000000001811', '00000000-0000-0000-0000-000000001801', 'Dinner', 'inviting',
   '00000000-0000-0000-0000-000000001810');
insert into public.invites(event_id, invitee_id, status, position) values
  ('00000000-0000-0000-0000-000000001811', '00000000-0000-0000-0000-000000001802', 'accepted', 0);
insert into public.room_members(room_id, member_id) values
  ('00000000-0000-0000-0000-000000001810', '00000000-0000-0000-0000-000000001801'),
  ('00000000-0000-0000-0000-000000001810', '00000000-0000-0000-0000-000000001802') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001801","role":"authenticated"}', true);
select lives_ok($$insert into public.announcements(id, event_id, author_id, body) values
  ('00000000-0000-0000-0000-000000001812', '00000000-0000-0000-0000-000000001811',
   '00000000-0000-0000-0000-000000001801', 'Door code 4412')$$, 'host can post the announcement');
select is((select count(*)::int from public.messages where room_id = '00000000-0000-0000-0000-000000001810'),
  1, 'the room copy is committed atomically without provider fan-out');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001802","role":"authenticated"}', true);
select is((select count(*)::int from public.announcements where id = '00000000-0000-0000-0000-000000001812'),
  1, 'accepted attendee can read the update');
select is((select count(*)::int from public.messages where room_id = '00000000-0000-0000-0000-000000001810'),
  1, 'accepted attendee can read its room copy');
reset role;
update public.invites set status = 'declined' where invitee_id = '00000000-0000-0000-0000-000000001802';
set local role authenticated;
select is((select count(*)::int from public.announcements where id = '00000000-0000-0000-0000-000000001812'),
  0, 'declined invitee cannot read the update');
select is((select count(*)::int from public.messages where room_id = '00000000-0000-0000-0000-000000001810'),
  0, 'stale room membership cannot bypass the audience');
reset role;
update public.invites set status = 'waitlisted' where invitee_id = '00000000-0000-0000-0000-000000001802';
set local role authenticated;
select is((select count(*)::int from public.announcements where id = '00000000-0000-0000-0000-000000001812'),
  0, 'waitlisted invitee cannot read the update');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000001801","role":"authenticated"}', true);
update public.messages set announcement_id = null
  where room_id = '00000000-0000-0000-0000-000000001810';
select is((select count(*)::int from public.messages
  where announcement_id = '00000000-0000-0000-0000-000000001812'), 1,
  'RLS refuses direct edits even by the original author');
reset role;
select throws_ok($$update public.messages set announcement_id = null
  where room_id = '00000000-0000-0000-0000-000000001810'$$,
  'announcement copies are immutable', 'even privileged writes cannot detach the audience marker');
set local role authenticated;
select throws_ok($$insert into public.messages(room_id, sender_id, body, announcement_id) values
  ('00000000-0000-0000-0000-000000001810', '00000000-0000-0000-0000-000000001801', 'Forged',
   '00000000-0000-0000-0000-000000001812')$$,
  'announcement copies are server-written', 'clients cannot forge a mirror');
select * from finish();
rollback;
