-- pgTAP regression tests for Switchboard's security invariants.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db
--
-- These assert the two documented anonymity invariants plus the C1
-- room-membership fix, so a future migration cannot silently reopen them.
--
-- Convention: we seed as the privileged migration role, then switch to the
-- `authenticated` role with a specific user's JWT claims to exercise RLS as
-- that user would experience it.

begin;
select plan(6);

-- ————————————————————————— fixtures —————————————————————————
-- Two users: "alice" (author/owner) and "mallory" (the attacker).
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a11c', 'alice@example.com'),
  ('00000000-0000-0000-0000-00000000ba11', 'mallory@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a11c', 'Alice', true),
  ('00000000-0000-0000-0000-00000000ba11', 'Mallory', true);

-- Alice hosts an event with a poll, and casts a private vote.
insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-00000000a11c', 'Alice dinner', 'inviting');
insert into public.polls (id, event_id, phase) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000e0001', 'voting');
insert into public.poll_options (id, poll_id, label) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000b0001', 'Thai');
insert into public.poll_votes (poll_id, option_id, voter_id, weight) values
  ('00000000-0000-0000-0000-0000000b0001', '00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-00000000a11c', 2);

-- Alice records a private mutual intent toward Mallory.
insert into public.mutual_intents (id, author_id, target_id, activity, kind, status) values
  ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-00000000a11c', '00000000-0000-0000-0000-00000000ba11', 'coffee', 'down_to_connect', 'active');

-- Alice creates a private room she owns.
insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-0000000c0001', 'group', 'Alice room', '00000000-0000-0000-0000-00000000a11c');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000a11c');

-- ————————————————————————— act as Mallory —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ba11","role":"authenticated"}', true);

-- Invariant 1: poll votes are author-only. Mallory sees none of Alice's votes.
select is(
  (select count(*)::int from public.poll_votes
     where voter_id = '00000000-0000-0000-0000-00000000a11c'),
  0,
  'C-invariant-1: a non-author cannot read another user''s poll_votes'
);

-- Invariant 2: mutual intents are author-only. Mallory (the TARGET) cannot see
-- Alice's unrequited interest.
select is(
  (select count(*)::int from public.mutual_intents
     where author_id = '00000000-0000-0000-0000-00000000a11c'),
  0,
  'C-invariant-2: a target cannot read an unrequited mutual_intent'
);

-- C1: Mallory cannot self-insert into a room she did not create.
select throws_ok(
  $$ insert into public.room_members (room_id, member_id)
       values ('00000000-0000-0000-0000-0000000c0001', '00000000-0000-0000-0000-00000000ba11') $$,
  '42501',
  null,
  'C1: a non-creator cannot insert themselves into another user''s room'
);

-- C1 corollary: and therefore cannot read that room's contents.
select is(
  (select count(*)::int from public.room_members
     where room_id = '00000000-0000-0000-0000-0000000c0001'),
  0,
  'C1: a non-member cannot read a private room''s membership'
);

-- ————————————————————————— act as Alice —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a11c","role":"authenticated"}', true);

-- Positive control: the author CAN read her own vote and intent (proves the
-- policies aren't just blocking everyone).
select is(
  (select count(*)::int from public.poll_votes
     where voter_id = '00000000-0000-0000-0000-00000000a11c'),
  1,
  'author can read her own poll_votes'
);
select is(
  (select count(*)::int from public.mutual_intents
     where author_id = '00000000-0000-0000-0000-00000000a11c'),
  1,
  'author can read her own mutual_intents'
);

select * from finish();
rollback;
