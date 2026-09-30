-- pgTAP coverage for the guardian hold (20260930011000_guardian_hold.sql,
-- decision D2): on a plan that needs a parent or guardian's approval, every
-- RSVP path holds the yes as `pending_approval` — no seat, no room — until the
-- guardian approves it; approval re-checks capacity; denial releases it; and
-- nothing else may turn a held yes into a counted one.
--
--   supabase test db

begin;
select plan(16);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d101', 'hold-host@example.com'),
  ('00000000-0000-0000-0000-00000000d102', 'hold-kid-one@example.com'),
  ('00000000-0000-0000-0000-00000000d103', 'hold-kid-two@example.com'),
  ('00000000-0000-0000-0000-00000000d104', 'hold-kid-three@example.com'),
  ('00000000-0000-0000-0000-00000000d105', 'hold-kid-four@example.com'),
  ('00000000-0000-0000-0000-00000000d106', 'hold-requester@example.com'),
  ('00000000-0000-0000-0000-00000000d107', 'hold-adult@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000d101', 'Hold Host', true),
  ('00000000-0000-0000-0000-00000000d102', 'Kid One', true),
  ('00000000-0000-0000-0000-00000000d103', 'Kid Two', true),
  ('00000000-0000-0000-0000-00000000d104', 'Kid Three', true),
  ('00000000-0000-0000-0000-00000000d105', 'Kid Four', true),
  ('00000000-0000-0000-0000-00000000d106', 'Requester', true),
  ('00000000-0000-0000-0000-00000000d107', 'Adult', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-00000000d1a0', 'event', 'Youth practice',
   '00000000-0000-0000-0000-00000000d101');

-- One seat, guardian approval required. A second plan without it is the
-- control that nothing changed for everyone else.
insert into public.events (
  id, host_id, title, status, capacity, invite_mode, parental_approval, room_id
) values
  ('00000000-0000-0000-0000-00000000d1e1', '00000000-0000-0000-0000-00000000d101',
   'Youth practice', 'inviting', 1, 'group', true,
   '00000000-0000-0000-0000-00000000d1a0'),
  ('00000000-0000-0000-0000-00000000d1e2', '00000000-0000-0000-0000-00000000d101',
   'Grown-up dinner', 'inviting', null, 'group', false, null);

insert into public.invites (
  id, event_id, invitee_id, guest_name, guest_token, position, status, sent_at
) values
  ('00000000-0000-0000-0000-00000000d1b1', '00000000-0000-0000-0000-00000000d1e1',
   '00000000-0000-0000-0000-00000000d102', null,
   '00000000-0000-0000-0000-00000000d1c1', 0, 'sent', now()),
  ('00000000-0000-0000-0000-00000000d1b2', '00000000-0000-0000-0000-00000000d1e1',
   '00000000-0000-0000-0000-00000000d103', null,
   '00000000-0000-0000-0000-00000000d1c2', 1, 'sent', now()),
  ('00000000-0000-0000-0000-00000000d1b3', '00000000-0000-0000-0000-00000000d1e1',
   '00000000-0000-0000-0000-00000000d104', null,
   '00000000-0000-0000-0000-00000000d1c3', 2, 'sent', now()),
  -- A guest invitation answered through its own token.
  ('00000000-0000-0000-0000-00000000d1b5', '00000000-0000-0000-0000-00000000d1e1',
   null, 'Guest Five',
   '00000000-0000-0000-0000-00000000d1c5', 3, 'sent', now()),
  -- An Open Table request waiting on the host.
  ('00000000-0000-0000-0000-00000000d1b6', '00000000-0000-0000-0000-00000000d1e1',
   '00000000-0000-0000-0000-00000000d106', null,
   '00000000-0000-0000-0000-00000000d1c6', 4, 'requested', null),
  ('00000000-0000-0000-0000-00000000d1b7', '00000000-0000-0000-0000-00000000d1e2',
   '00000000-0000-0000-0000-00000000d107', null,
   '00000000-0000-0000-0000-00000000d1c7', 0, 'sent', now());

-- ————————————————————————— every path holds the yes —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d102","role":"authenticated"}', true);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-00000000d1b1', true),
  'pending_approval',
  'the in-app RSVP on a guardian plan is held, not accepted'
);

-- The plan has one seat. Had the first yes taken it, this one would be
-- waitlisted; a held yes takes no seat, so it is held too.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d103","role":"authenticated"}', true);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-00000000d1b2', true),
  'pending_approval',
  'a held yes takes no seat'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d101","role":"authenticated"}', true);
select is(
  public.approve_join_request('00000000-0000-0000-0000-00000000d1b6'),
  'pending_approval',
  'a host letting in an Open Table request on a guardian plan holds it too'
);

reset role;
select is(
  (select count(*)::int from public.room_members
    where room_id = '00000000-0000-0000-0000-00000000d1a0'
      and member_id = '00000000-0000-0000-0000-00000000d102'),
  0,
  'a held yes does not join the plan''s room'
);

select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '00000000-0000-0000-0000-00000000d1e1'),
    '00000000-0000-0000-0000-00000000d105', 'Kid Four', '', true)),
  'pending_approval',
  'a yes through the share link is held'
);

select is(
  public.respond_to_guest_invite('00000000-0000-0000-0000-00000000d1c5', true),
  'pending_approval',
  'a yes through a guest token is held'
);

-- ————————————————————————— nothing else may count it —————————————————————————
select throws_ok(
  $$ update public.invites set status = 'accepted'
       where id = '00000000-0000-0000-0000-00000000d1b3' $$,
  'P0001',
  'guardian approval required',
  'no write may make a guardian plan''s invite count without an approval'
);

-- ————————————————————————— the guardian answers —————————————————————————
insert into public.parental_approvals (invite_id, event_id, guardian_email, token) values
  ('00000000-0000-0000-0000-00000000d1b1', '00000000-0000-0000-0000-00000000d1e1',
   'guardian-one@example.com', 'hold-token-one'),
  ('00000000-0000-0000-0000-00000000d1b2', '00000000-0000-0000-0000-00000000d1e1',
   'guardian-two@example.com', 'hold-token-two');
insert into public.parental_approvals (invite_id, event_id, guardian_email, token)
select id, event_id, 'guardian-four@example.com', 'hold-token-four'
  from public.invites
 where event_id = '00000000-0000-0000-0000-00000000d1e1'
   and invitee_id = '00000000-0000-0000-0000-00000000d105';

set local role anon;
select is(
  public.resolve_parental_approval('hold-token-one', true)->>'invite_status',
  'accepted',
  'the guardian''s approval makes a held yes count'
);

reset role;
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-00000000d1b1'),
  'accepted',
  'the approved invite is stored as accepted'
);
select is(
  (select count(*)::int from public.room_members
    where room_id = '00000000-0000-0000-0000-00000000d1a0'
      and member_id = '00000000-0000-0000-0000-00000000d102'),
  1,
  'an approved yes joins the plan''s room'
);

set local role anon;
select is(
  public.resolve_parental_approval('hold-token-two', true)->>'invite_status',
  'waitlisted',
  'approval re-checks capacity at that moment: the one seat is gone, so waitlist'
);
select is(
  public.resolve_parental_approval('hold-token-four', false)->>'outcome',
  'denied',
  'a guardian can deny'
);

reset role;
select is(
  (select status from public.invites
    where event_id = '00000000-0000-0000-0000-00000000d1e1'
      and invitee_id = '00000000-0000-0000-0000-00000000d105'),
  'declined',
  'denial releases the held yes'
);
select is(
  (select status from public.parental_approvals where token = 'hold-token-four'),
  'denied',
  'the denial is recorded'
);

set local role anon;
select is(
  public.resolve_parental_approval('hold-token-one', false)->>'outcome',
  'already_resolved',
  'an answered link cannot be answered again'
);

-- ————————————————————————— control: every other plan —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000d107","role":"authenticated"}', true);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-00000000d1b7', true),
  'accepted',
  'a plan without guardian approval still counts a yes at once'
);

select * from finish();
rollback;
