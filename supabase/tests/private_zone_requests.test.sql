-- pgTAP coverage for 20260930040000_private_zone_requests.sql (P10, D10).
--
-- A denied or removed requester is told the truth and may ask once more after
-- 30 days; a waiting request is not duplicated; nobody can erase a decision to
-- get around the wait; leaving is free and ends your check-in there.

begin;
select plan(20);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000701a', 'zr-organizer@example.com'),
  ('00000000-0000-0000-0000-00000000702b', 'zr-requester@example.com'),
  ('00000000-0000-0000-0000-00000000703c', 'zr-member@example.com'),
  ('00000000-0000-0000-0000-00000000704d', 'zr-leaver@example.com'),
  ('00000000-0000-0000-0000-00000000705e', 'zr-stranger@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000701a', 'ZR Organizer', true),
  ('00000000-0000-0000-0000-00000000702b', 'ZR Requester', true),
  ('00000000-0000-0000-0000-00000000703c', 'ZR Member', true),
  ('00000000-0000-0000-0000-00000000704d', 'ZR Leaver', true),
  ('00000000-0000-0000-0000-00000000705e', 'ZR Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.zones (id, slug, name, organizer_id, visibility) values
  ('00000000-0000-0000-0000-0000000f0701'::uuid, 'zr-retreat', 'Retreat',
   '00000000-0000-0000-0000-00000000701a', 'private'),
  ('00000000-0000-0000-0000-0000000f0702'::uuid, 'zr-open-day', 'Open Day',
   '00000000-0000-0000-0000-00000000701a', 'public');

insert into public.zone_members (zone_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000f0701'::uuid, '00000000-0000-0000-0000-00000000703c', 'member'),
  ('00000000-0000-0000-0000-0000000f0701'::uuid, '00000000-0000-0000-0000-00000000704d', 'member');

insert into public.moments (id, user_id, zone_id, place_name, status, available_until) values
  ('00000000-0000-0000-0000-0000000d0701'::uuid, '00000000-0000-0000-0000-00000000703c',
   '00000000-0000-0000-0000-0000000f0701'::uuid, 'Retreat', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000d0702'::uuid, '00000000-0000-0000-0000-00000000704d',
   '00000000-0000-0000-0000-0000000f0701'::uuid, 'Retreat', 'open', now() + interval '2 hours');

set local role authenticated;

-- ————————————————————————— asking —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);

select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0701'::uuid, 'Hi, I''m on the retreat')),
  'requested',
  'a first ask files a request'
);

select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0701'::uuid, null)),
  'pending',
  'asking again while one is waiting says so, and files nothing new'
);

select is(
  (select status from public.zone_join_requests
    where zone_id = '00000000-0000-0000-0000-0000000f0701'::uuid),
  'pending',
  'the requester can read their own request and its real status'
);

select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0702'::uuid, null)),
  'unavailable',
  'a public zone has nothing to ask for'
);

select throws_ok(
  $$ insert into public.zone_join_requests (zone_id, requester_id, note)
     values ('00000000-0000-0000-0000-0000000f0702'::uuid,
             '00000000-0000-0000-0000-00000000702b', 'direct') $$,
  '42501',
  null,
  'there is no direct insert path around request_zone_join'
);

-- ————————————————————————— a denial —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000701a","role":"authenticated"}', true);

select ok(
  public.resolve_zone_join_request(
    (select id from public.zone_join_requests
      where requester_id = '00000000-0000-0000-0000-00000000702b'), false),
  'the organizer can pass on a request'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);

select is(
  (select status from public.zone_join_requests
    where requester_id = '00000000-0000-0000-0000-00000000702b'),
  'denied',
  'the requester sees that they were denied'
);

select ok(
  (select retry_after > now() + interval '29 days'
     from public.request_zone_join('00000000-0000-0000-0000-0000000f0701'::uuid, null)
    where outcome = 'wait'),
  'within 30 days of a denial, asking again says when they may'
);

-- Deleting the decision used to be the way around any wait.
delete from public.zone_join_requests
 where requester_id = '00000000-0000-0000-0000-00000000702b';
select is(
  (select status from public.zone_join_requests
    where requester_id = '00000000-0000-0000-0000-00000000702b'),
  'denied',
  'a requester cannot erase a decision'
);

-- ————————————————————————— the one new ask —————————————————————————
reset role;
update public.zone_join_requests
   set decided_at = now() - interval '31 days'
 where requester_id = '00000000-0000-0000-0000-00000000702b';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);

select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0701'::uuid, 'Trying once more')),
  'requested',
  'after 30 days a denied requester may ask again'
);

select is(
  (select asks from public.zone_join_requests
    where requester_id = '00000000-0000-0000-0000-00000000702b'),
  2,
  'and that ask is counted'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000701a","role":"authenticated"}', true);
select ok(
  public.resolve_zone_join_request(
    (select id from public.zone_join_requests
      where requester_id = '00000000-0000-0000-0000-00000000702b'), false),
  'the organizer can pass a second time'
);

reset role;
update public.zone_join_requests
   set decided_at = now() - interval '90 days'
 where requester_id = '00000000-0000-0000-0000-00000000702b';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000702b","role":"authenticated"}', true);

select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0701'::uuid, null)),
  'closed',
  'there is one new ask, not an endless series of them'
);

-- ————————————————————————— removal —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000701a","role":"authenticated"}', true);
delete from public.zone_members
 where zone_id = '00000000-0000-0000-0000-0000000f0701'::uuid
   and member_id = '00000000-0000-0000-0000-00000000703c';

reset role;
select is(
  (select status from public.zone_join_requests
    where zone_id = '00000000-0000-0000-0000-0000000f0701'::uuid
      and requester_id = '00000000-0000-0000-0000-00000000703c'),
  'removed',
  'a removal is recorded as a decision about that person'
);
select is(
  (select status from public.moments where id = '00000000-0000-0000-0000-0000000d0701'::uuid),
  'closed',
  'a removed member''s check-in there ends'
);
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000703c","role":"authenticated"}', true);
select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0701'::uuid, null)),
  'wait',
  'someone removed waits 30 days like someone denied'
);

-- ————————————————————————— leaving —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000704d","role":"authenticated"}', true);

select lives_ok(
  $$ delete from public.zone_members
      where zone_id = '00000000-0000-0000-0000-0000000f0701'::uuid
        and member_id = '00000000-0000-0000-0000-00000000704d' $$,
  'a member can leave'
);

select is(
  (select status from public.moments where id = '00000000-0000-0000-0000-0000000d0702'::uuid),
  'closed',
  'leaving ends your check-in there'
);

select is(
  (select outcome from public.request_zone_join(
     '00000000-0000-0000-0000-0000000f0701'::uuid, null)),
  'requested',
  'leaving counts against nothing: they may ask straight back in'
);

-- ————————————————————————— strangers —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000705e","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.zone_join_requests),
  0,
  'nobody reads anyone else''s request'
);

select * from finish();
rollback;
