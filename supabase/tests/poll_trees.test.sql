-- pgTAP tests for poll trees (20260812130000_poll_trees.sql).
--
-- The load-bearing claim is that unlocking is server-authoritative and
-- idempotent: a follow-up opens exactly once, when its parent is decided, and
-- a second run (the cron sweep racing the host's own "close voting") cannot
-- reopen a poll people have already moved past.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db

begin;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000301a', 'host@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000301a', 'Host', true)
on conflict (id) do update set display_name = excluded.display_name;

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000e0301', '00000000-0000-0000-0000-00000000301a',
   'Dinner', 'inviting');

-- The date question, and two follow-ups waiting on it.
insert into public.polls (id, event_id, topic, phase) values
  ('00000000-0000-0000-0000-00000000a001'::uuid,
   '00000000-0000-0000-0000-0000000e0301', 'date', 'suggesting');
insert into public.polls (id, event_id, topic, phase, parent_poll_id) values
  ('00000000-0000-0000-0000-00000000a002'::uuid,
   '00000000-0000-0000-0000-0000000e0301', 'place', 'pending',
   '00000000-0000-0000-0000-00000000a001'::uuid),
  ('00000000-0000-0000-0000-00000000a003'::uuid,
   '00000000-0000-0000-0000-0000000e0301', 'food', 'pending',
   '00000000-0000-0000-0000-00000000a001'::uuid);

-- ————————————————————————— the parent is still open —————————————————————————

-- Nothing opens early. This is the whole promise of a chain: one question at a
-- time, and the next one is not askable yet.
select is(
  (select count(*)::int from public.resolve_poll_children(
     '00000000-0000-0000-0000-00000000a001'::uuid)),
  0,
  'no follow-up opens while the parent is still being decided'
);

select is(
  (select count(*)::int from public.polls where phase = 'pending'),
  2,
  'both follow-ups are still pending'
);

-- ————————————————————————— the parent lands —————————————————————————

update public.polls set phase = 'decided'
  where id = '00000000-0000-0000-0000-00000000a001'::uuid;

select is(
  (select count(*)::int from public.resolve_poll_children(
     '00000000-0000-0000-0000-00000000a001'::uuid)),
  2,
  'both follow-ups open when the parent is decided'
);

select is(
  (select phase from public.polls
    where id = '00000000-0000-0000-0000-00000000a002'::uuid),
  'suggesting',
  'an opened follow-up is votable'
);

-- ————————————————————————— running it twice —————————————————————————
-- The host closing a poll and the deadline sweep can both fire for the same
-- poll. The second run must be a no-op, not a phase reset.

update public.polls set phase = 'voting'
  where id = '00000000-0000-0000-0000-00000000a002'::uuid;

select is(
  (select count(*)::int from public.resolve_poll_children(
     '00000000-0000-0000-0000-00000000a001'::uuid)),
  0,
  're-running the unlock opens nothing a second time'
);

select is(
  (select phase from public.polls
    where id = '00000000-0000-0000-0000-00000000a002'::uuid),
  'voting',
  'a poll that has moved on is not reset by a repeat unlock'
);

-- ————————————————————————— structural guards —————————————————————————

select throws_ok(
  $$ update public.polls
       set parent_poll_id = '00000000-0000-0000-0000-00000000a003'::uuid
     where id = '00000000-0000-0000-0000-00000000a002'::uuid $$,
  'poll order is immutable',
  'the order of a chain cannot be rewritten after the fact'
);

select throws_ok(
  $$ insert into public.polls (id, event_id, topic, phase, parent_poll_id)
     values ('00000000-0000-0000-0000-00000000a009'::uuid,
             '00000000-0000-0000-0000-0000000e0301', 'custom', 'pending',
             '00000000-0000-0000-0000-00000000a009'::uuid) $$,
  'a poll cannot follow itself',
  'a poll cannot be its own parent'
);

select * from finish();
rollback;
