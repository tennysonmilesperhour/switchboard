begin;
select plan(4);

insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-000000000001', 'room-host@example.com'),
  ('20000000-0000-0000-0000-000000000002', 'room-direct@example.com'),
  ('20000000-0000-0000-0000-000000000003', 'room-guest@example.com');

-- These are fully registered RSVP participants; eligibility refusals have separate tests.
update public.profiles set onboarded = true, legal_terms_version = '2026-08-31'
where id in ('20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003');

insert into public.profiles (id, display_name, onboarded) values
  ('20000000-0000-0000-0000-000000000001', 'Room Host', true),
  ('20000000-0000-0000-0000-000000000002', 'Direct Invitee', true),
  ('20000000-0000-0000-0000-000000000003', 'Claimed Guest', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.rooms (id, kind, title, created_by) values
  ('20000000-0000-0000-0000-000000000011', 'event', 'Direct room', '20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000012', 'event', 'Guest room', '20000000-0000-0000-0000-000000000001');

insert into public.room_members (room_id, member_id) values
  ('20000000-0000-0000-0000-000000000011', '20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000012', '20000000-0000-0000-0000-000000000001');

insert into public.events (id, host_id, title, status, room_id) values
  ('20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000001', 'Direct event', 'inviting', '20000000-0000-0000-0000-000000000011'),
  ('20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000001', 'Guest event', 'inviting', '20000000-0000-0000-0000-000000000012');

insert into public.invites (
  id, event_id, invitee_id, guest_name, guest_token, position, status
) values
  ('20000000-0000-0000-0000-000000000031', '20000000-0000-0000-0000-000000000021', '20000000-0000-0000-0000-000000000002', null, '20000000-0000-0000-0000-000000000041', 0, 'sent'),
  ('20000000-0000-0000-0000-000000000032', '20000000-0000-0000-0000-000000000022', '20000000-0000-0000-0000-000000000003', 'Claimed Guest', '20000000-0000-0000-0000-000000000042', 0, 'sent');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);

select is(
  public.respond_to_invite('20000000-0000-0000-0000-000000000031', true),
  'accepted',
  'a direct invite can be accepted'
);
select ok(
  public.is_current_user_room_member(
    '20000000-0000-0000-0000-000000000011'
  ),
  'accepting a direct invite atomically joins its Living Room'
);

reset role;
select is(
  public.respond_to_guest_invite(
    '20000000-0000-0000-0000-000000000042',
    true
  ),
  'accepted',
  'a claimed guest invite can be accepted'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select ok(
  public.is_current_user_room_member(
    '20000000-0000-0000-0000-000000000012'
  ),
  'accepting a claimed guest invite atomically joins its Living Room'
);

select * from finish();
rollback;
