-- Invariants for the public per-plan share link (`/i/<share_token>`).
--
-- The link is the one thing a host can text to someone who has no account, so
-- these cover the two directions that matter: it must WORK for a stranger
-- holding a valid token, and it must not become a way to reach a plan whose
-- host has closed it — or to pin the token to a value someone else can guess.

begin;
select plan(20);

insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000001', 'share-host@example.com'),
  ('30000000-0000-0000-0000-000000000002', 'share-member@example.com'),
  ('30000000-0000-0000-0000-000000000003', 'share-stranger@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('30000000-0000-0000-0000-000000000001', 'Share Host', true),
  ('30000000-0000-0000-0000-000000000002', 'Existing Member', true),
  ('30000000-0000-0000-0000-000000000003', 'Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status, capacity) values
  ('30000000-0000-0000-0000-000000000021', '30000000-0000-0000-0000-000000000001', 'Open plan', 'inviting', null),
  ('30000000-0000-0000-0000-000000000022', '30000000-0000-0000-0000-000000000001', 'Full plan', 'inviting', 1),
  ('30000000-0000-0000-0000-000000000023', '30000000-0000-0000-0000-000000000001', 'Wrapped plan', 'past', null);

-- ————————————————————————— defaults —————————————————————————
-- Every plan gets a live link the moment it exists, whatever route created it.
-- The previous fix set this default in the creation wizard's useState, so plans
-- that were cloned/recurring/ritual-published kept a dead link.
select isnt(
  (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
  null,
  'every event is minted with a share token'
);
select ok(
  (select share_link_active from public.events where id = '30000000-0000-0000-0000-000000000021'),
  'the share link is live by default, in the database'
);
select ok(
  (select count(distinct share_token) = 3 from public.events
    where id in (
      '30000000-0000-0000-0000-000000000021',
      '30000000-0000-0000-0000-000000000022',
      '30000000-0000-0000-0000-000000000023'
    )),
  'share tokens are distinct per plan'
);

-- ————————————————————————— a stranger can RSVP —————————————————————————
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
    null, 'Dana', null, true
  )),
  'accepted',
  'a signed-out stranger holding the token can accept'
);
select is(
  (select count(*)::int from public.invites
    where event_id = '30000000-0000-0000-0000-000000000021' and guest_name = 'Dana'),
  1,
  'accepting through the link mints exactly one invite'
);
select isnt(
  (select token from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
    null, 'Eli', null, false
  )),
  null,
  'the responder is handed their own durable RSVP token'
);

-- A signed-in visitor answers their existing invite rather than doubling up.
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('30000000-0000-0000-0000-000000000031', '30000000-0000-0000-0000-000000000021',
   '30000000-0000-0000-0000-000000000002', 90, 'sent');
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
    '30000000-0000-0000-0000-000000000002', 'Existing Member', null, true
  )),
  'accepted',
  'a signed-in invitee can answer through the link'
);
select is(
  (select count(*)::int from public.invites
    where event_id = '30000000-0000-0000-0000-000000000021'
      and invitee_id = '30000000-0000-0000-0000-000000000002'),
  1,
  'answering through the link does not duplicate an existing invite'
);

-- ————————————————————————— the gates hold —————————————————————————
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000023'),
    null, 'Dana', null, true
  )),
  'not_accepting',
  'a wrapped-up plan refuses link RSVPs'
);

update public.events set share_link_active = false
 where id = '30000000-0000-0000-0000-000000000021';
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
    null, 'Dana', null, true
  )),
  'link_off',
  'the host kill switch stops the link'
);
update public.events set share_link_active = true
 where id = '30000000-0000-0000-0000-000000000021';

select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
    null, '   ', null, true
  )),
  'name_required',
  'a blank name is refused so the host is never shown an anonymous guest'
);

select ok(
  (select count(*) = 0 from public.rsvp_via_share_token(
    gen_random_uuid(), null, 'Nobody', null, true
  )),
  'an unknown token resolves to no plan at all'
);

-- Regression guard for the trap this nearly shipped with: invite_mode defaults
-- to 'individual', which respond_to_guest_invite reads as an implicit capacity
-- of ONE. Inherited here, the second person to tap a texted link would have been
-- waitlisted — which reads to them as exactly the "broken link" this feature
-- exists to fix. Only an explicit capacity caps a share link.
select is(
  (select invite_mode from public.events where id = '30000000-0000-0000-0000-000000000021'),
  'individual',
  'the plan under test uses the default invite mode'
);
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000021'),
    null, 'Second Stranger', null, true
  )),
  'accepted',
  'a second stranger is admitted when the host set no capacity'
);

-- Capacity is enforced under the event row lock, same as every other accept.
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000022'),
    null, 'First', null, true
  )),
  'accepted',
  'the first link RSVP fits the capacity of one'
);
select is(
  (select outcome from public.rsvp_via_share_token(
    (select share_token from public.events where id = '30000000-0000-0000-0000-000000000022'),
    null, 'Second', null, true
  )),
  'waitlisted',
  'a link RSVP past capacity is waitlisted, never over-booked'
);

-- ————————————————————————— the token is immutable —————————————————————————
-- events_update lets a host write their own event row. The token is a
-- capability, so it must only move through the rotate function (which re-checks
-- host/co-host) — never be pinned to a chosen or guessable value.
select throws_ok(
  $$update public.events set share_token = '30000000-0000-0000-0000-0000000000ff'
     where id = '30000000-0000-0000-0000-000000000021'$$,
  'event share token is immutable; use rotate_event_share_token()',
  'share_token cannot be written directly, even by the host'
);

select throws_ok(
  $$select public.rotate_event_share_token(
      '30000000-0000-0000-0000-000000000021',
      '30000000-0000-0000-0000-000000000002')$$,
  'not a host of this plan',
  'a non-host cannot rotate someone else''s invite link'
);

-- Rotation must actually invalidate what was already shared, or "get a new
-- link" is theatre.
create temporary table rotated_share_link as
select share_token as before from public.events
 where id = '30000000-0000-0000-0000-000000000021';

select isnt(
  public.rotate_event_share_token(
    '30000000-0000-0000-0000-000000000021',
    '30000000-0000-0000-0000-000000000001'
  ),
  (select before from rotated_share_link),
  'the host can rotate the link, and gets a different token'
);
select ok(
  (select count(*) = 0 from public.rsvp_via_share_token(
    (select before from rotated_share_link), null, 'Late', null, true
  )),
  'the rotated-away token stops resolving'
);

select * from finish();
rollback;
