-- Invite creation must honor profile blocks, cap each plan, and leave RSVP
-- states to the recipient response functions.

begin;
select plan(6);

insert into auth.users (id, email) values
  ('50000000-0000-0000-0000-000000000001', 'invite-host@example.com'),
  ('50000000-0000-0000-0000-000000000002', 'invite-blocked@example.com'),
  ('50000000-0000-0000-0000-000000000003', 'invite-allowed@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('50000000-0000-0000-0000-000000000001', 'Invite Host', true),
  ('50000000-0000-0000-0000-000000000002', 'Blocked Invitee', true),
  ('50000000-0000-0000-0000-000000000003', 'Allowed Invitee', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- The invitee authored the block. Invitation checks are symmetric, so the
-- host must still be unable to add them.
insert into public.profile_blocks (blocker_id, blocked_id) values (
  '50000000-0000-0000-0000-000000000002',
  '50000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ select public.create_event_atomic(jsonb_build_object(
       'title', 'Blocked atomic plan',
       'inviteMode', 'individual',
       'invitees', jsonb_build_array(
         jsonb_build_object(
           'profileId', '50000000-0000-0000-0000-000000000002'
         )
       )
     )) $$,
  '42501',
  'blocked profiles cannot be invited',
  'create_event_atomic rejects a profile blocked in either direction'
);

reset role;
select is(
  (select count(*)::integer from public.events where title = 'Blocked atomic plan'),
  0,
  'a rejected atomic publish leaves no partial event behind'
);

insert into public.events (id, host_id, title, status) values (
  '50000000-0000-0000-0000-000000000010',
  '50000000-0000-0000-0000-000000000001',
  'Invite policy plan',
  'inviting'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select throws_ok(
  $$ insert into public.invites (event_id, invitee_id, position, status)
     values (
       '50000000-0000-0000-0000-000000000010',
       '50000000-0000-0000-0000-000000000003',
       0,
       'accepted'
     ) $$,
  '42501',
  null,
  'a host cannot forge an accepted RSVP through direct insert'
);

select throws_ok(
  $$ insert into public.invites (event_id, invitee_id, position, status)
     values (
       '50000000-0000-0000-0000-000000000010',
       '50000000-0000-0000-0000-000000000002',
       0,
       'queued'
     ) $$,
  '42501',
  'blocked profiles cannot be invited',
  'the insert boundary also refuses a blocked profile'
);

select lives_ok(
  $$ insert into public.invites (event_id, invitee_id, position, status)
     values (
       '50000000-0000-0000-0000-000000000010',
       '50000000-0000-0000-0000-000000000003',
       0,
       'queued'
     ) $$,
  'a host can still queue an unblocked profile'
);

reset role;
insert into public.invites (event_id, guest_name, position, status)
select
  '50000000-0000-0000-0000-000000000010',
  'Guest ' || n,
  n,
  'queued'
from generate_series(1, 99) as n;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$ insert into public.invites (event_id, guest_name, position, status)
     values (
       '50000000-0000-0000-0000-000000000010',
       'Guest 101',
       100,
       'queued'
     ) $$,
  '23514',
  'plan invite limit exceeded',
  'the database refuses a one-hundred-and-first invite'
);

select * from finish();
rollback;
