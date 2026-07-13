-- pgTAP test for audit fix H1: during the `deciding` phase, an invited voter can
-- see and vote on the poll (even while their invite is still `queued`), while a
-- stranger cannot — and the access closes again once the event leaves `deciding`.
--
--   supabase test db

begin;
select plan(6);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0570', 'host@example.com'),
  ('00000000-0000-0000-0000-0000000d05e2', 'voter@example.com'),
  ('00000000-0000-0000-0000-0000000d0111', 'stranger@example.com');
-- The on_auth_user_created trigger already inserted a profile row for each
-- auth.users row above, so upsert to set the fields this test needs.
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000d0570', 'Host', true),
  ('00000000-0000-0000-0000-0000000d05e2', 'Voter', true),
  ('00000000-0000-0000-0000-0000000d0111', 'Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- An event still in the `deciding` phase (group votes before invites go out).
insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000d0570', 'What should we do?', 'deciding');
insert into public.polls (id, event_id, phase) values
  ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000e0002', 'voting');
insert into public.poll_options (id, poll_id, label) values
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000b0002', 'Picnic');
-- The voter is invited but still queued (no invite has been sent yet).
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-0000000a0002', '00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000d05e2', 0, 'queued');

-- ————————————————————————— act as the invited voter —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d05e2","role":"authenticated"}', true);

select ok(
  public.can_view_event('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000d05e2'),
  'H1: a queued invitee CAN view a deciding-phase event'
);
select is(
  (select count(*)::int from public.polls where id = '00000000-0000-0000-0000-0000000b0002'),
  1,
  'H1: a queued invitee can read the poll while deciding'
);
select lives_ok(
  $$ insert into public.poll_votes (poll_id, option_id, voter_id, weight)
       values ('00000000-0000-0000-0000-0000000b0002', '00000000-0000-0000-0000-0000000f0002',
               '00000000-0000-0000-0000-0000000d05e2', 2) $$,
  'H1: a queued invitee can cast a vote while deciding'
);

-- ————————————————————————— act as a stranger —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d0111","role":"authenticated"}', true);

select ok(
  not public.can_view_event('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000d0111'),
  'H1: a non-invited stranger cannot view the deciding-phase event'
);
select is(
  (select count(*)::int from public.polls where id = '00000000-0000-0000-0000-0000000b0002'),
  0,
  'H1: a stranger cannot read the poll'
);

-- ————————————————————————— access closes after deciding —————————————————————————
-- Flip the event to `inviting` with the invite still queued (as the privileged
-- migration role), then confirm the voter loses view access again.
reset role;
update public.events set status = 'inviting' where id = '00000000-0000-0000-0000-0000000e0002';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d05e2","role":"authenticated"}', true);
select ok(
  not public.can_view_event('00000000-0000-0000-0000-0000000e0002', '00000000-0000-0000-0000-0000000d05e2'),
  'H1: once the event leaves deciding, a still-queued invitee can no longer view it'
);

select * from finish();
rollback;
