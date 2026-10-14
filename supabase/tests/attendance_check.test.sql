-- pgTAP coverage for 20261014123000_attendance_check.sql.
-- Only the guest, only an accepted Open Table seat, only in the 36 hours before;
-- a seat given back goes to the first person waiting.

begin;
select plan(13);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000cd001', 'seat-host@example.com'),
  ('00000000-0000-0000-0000-0000000cd002', 'seat-guest@example.com'),
  ('00000000-0000-0000-0000-0000000cd003', 'seat-waiting@example.com'),
  ('00000000-0000-0000-0000-0000000cd004', 'seat-other@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000cd001', 'Host', true),
  ('00000000-0000-0000-0000-0000000cd002', 'Guest', true),
  ('00000000-0000-0000-0000-0000000cd003', 'Waiting', true),
  ('00000000-0000-0000-0000-0000000cd004', 'Other', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-0000000cd0a1', 'event', 'Table for four', '00000000-0000-0000-0000-0000000cd001');
insert into public.events (id, host_id, title, status, starts_at, open_table, capacity, room_id) values
  ('00000000-0000-0000-0000-0000000cde01', '00000000-0000-0000-0000-0000000cd001', 'Table for four', 'confirmed',
   now() + interval '20 hours', true, 2, '00000000-0000-0000-0000-0000000cd0a1'),
  ('00000000-0000-0000-0000-0000000cde02', '00000000-0000-0000-0000-0000000cd001', 'Next month', 'confirmed',
   now() + interval '30 days', true, 2, null),
  ('00000000-0000-0000-0000-0000000cde03', '00000000-0000-0000-0000-0000000cd001', 'Friends only', 'confirmed',
   now() + interval '20 hours', false, 2, null);
insert into public.invites (id, event_id, invitee_id, status, position, responded_at) values
  ('00000000-0000-0000-0000-0000000cd101', '00000000-0000-0000-0000-0000000cde01', '00000000-0000-0000-0000-0000000cd002', 'accepted', 0, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000cd102', '00000000-0000-0000-0000-0000000cde01', '00000000-0000-0000-0000-0000000cd004', 'accepted', 1, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000cd103', '00000000-0000-0000-0000-0000000cde01', '00000000-0000-0000-0000-0000000cd003', 'waitlisted', 2, now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000cd104', '00000000-0000-0000-0000-0000000cde02', '00000000-0000-0000-0000-0000000cd002', 'accepted', 0, now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000cd105', '00000000-0000-0000-0000-0000000cde03', '00000000-0000-0000-0000-0000000cd002', 'accepted', 0, now() - interval '3 days');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-0000000cd0a1', '00000000-0000-0000-0000-0000000cd001'),
  ('00000000-0000-0000-0000-0000000cd0a1', '00000000-0000-0000-0000-0000000cd002'),
  ('00000000-0000-0000-0000-0000000cd0a1', '00000000-0000-0000-0000-0000000cd004')
on conflict do nothing;

select ok(
  not has_function_privilege('anon', 'public.confirm_attendance(uuid, boolean)', 'execute'),
  'signed-out callers cannot answer'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cd002","role":"authenticated"}', true);

select results_eq(
  $$select title from public.attendance_checks()$$,
  $$values ('Table for four'::text)$$,
  'asked only about an Open Table inside the window, not one next month or a friends plan'
);

select throws_ok(
  $$select * from public.confirm_attendance('00000000-0000-0000-0000-0000000cd104', true)$$,
  '42501', null, 'a plan outside the window cannot be confirmed yet'
);
select throws_ok(
  $$select * from public.confirm_attendance('00000000-0000-0000-0000-0000000cd105', false)$$,
  '42501', null, 'a plan that is not an Open Table is not part of this'
);
select throws_ok(
  $$select * from public.confirm_attendance('00000000-0000-0000-0000-0000000cd102', false)$$,
  '42501', null, 'nobody can give back someone else''s seat'
);

select is(
  (select outcome from public.confirm_attendance('00000000-0000-0000-0000-0000000cd101', true)),
  'confirmed',
  'a guest can say they are coming'
);
select is(
  (select count(*)::int from public.attendance_checks()),
  0,
  'and is not asked again'
);

select is(
  (select outcome from public.confirm_attendance('00000000-0000-0000-0000-0000000cd101', false)),
  'released',
  'a guest can still give the seat back after confirming'
);

reset role;
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000cd101'),
  'declined',
  'the seat given back is a decline'
);
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000cd103'),
  'accepted',
  'the first person waiting gets the seat'
);
select ok(
  exists (select 1 from public.room_members
          where room_id = '00000000-0000-0000-0000-0000000cd0a1'
            and member_id = '00000000-0000-0000-0000-0000000cd003'),
  'and joins the plan''s room'
);
select ok(
  not exists (select 1 from public.room_members
              where room_id = '00000000-0000-0000-0000-0000000cd0a1'
                and member_id = '00000000-0000-0000-0000-0000000cd002'),
  'the guest who gave it back has left the room'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000cd002","role":"authenticated"}', true);
select throws_ok(
  $$select * from public.confirm_attendance('00000000-0000-0000-0000-0000000cd101', true)$$,
  '42501', null, 'a seat already given back cannot be confirmed again'
);

select * from finish();
rollback;
