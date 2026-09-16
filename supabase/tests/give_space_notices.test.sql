-- pgTAP tests for the Give Space heads-up (20260916120000_give_space_notices.sql).
--
-- The feature's whole promise is "help me change my behavior without giving me
-- information about yours", so what is worth proving is mostly what the surface
-- REFUSES to do. Each test below is one of the ways the shipped version leaked:
--
--   * a viewer who has not committed gets no answer at all;
--   * the answer is one boolean, never a name, a count, or a status;
--   * once true it stays true, so a departure is unobservable;
--   * nobody can ask about anybody else, or write the row themselves.
--
-- Run with the Supabase CLI against a local stack:
--   supabase start
--   supabase test db

begin;
select plan(12);

-- ————————————————————————— fixtures —————————————————————————
-- gina gives space to alex. hal hosts two plans. casey is nobody in particular.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c17a', 'gina@example.com'),
  ('00000000-0000-0000-0000-00000000a1e8', 'alex@example.com'),
  ('00000000-0000-0000-0000-00000000ba12', 'hal@example.com'),
  ('00000000-0000-0000-0000-00000000ca5e', 'casey@example.com')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000c17a', 'Gina', true),
  ('00000000-0000-0000-0000-00000000a1e8', 'Alex', true),
  ('00000000-0000-0000-0000-00000000ba12', 'Hal', true),
  ('00000000-0000-0000-0000-00000000ca5e', 'Casey', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.profile_avoids (avoider_id, avoided_id) values
  ('00000000-0000-0000-0000-00000000c17a', '00000000-0000-0000-0000-00000000a1e8');

-- Plan A: alex is going. Plan B: only casey is.
insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000ea001', '00000000-0000-0000-0000-00000000ba12', 'Plan A', 'inviting'),
  ('00000000-0000-0000-0000-0000000eb002', '00000000-0000-0000-0000-00000000ba12', 'Plan B', 'inviting');

insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-0000000f0001', '00000000-0000-0000-0000-0000000ea001',
   '00000000-0000-0000-0000-00000000a1e8', 0, 'accepted'),
  -- Gina is invited to Plan A but has NOT answered yet.
  ('00000000-0000-0000-0000-0000000f0002', '00000000-0000-0000-0000-0000000ea001',
   '00000000-0000-0000-0000-00000000c17a', 1, 'sent'),
  ('00000000-0000-0000-0000-0000000f0003', '00000000-0000-0000-0000-0000000eb002',
   '00000000-0000-0000-0000-00000000ca5e', 0, 'accepted'),
  ('00000000-0000-0000-0000-0000000f0004', '00000000-0000-0000-0000-0000000eb002',
   '00000000-0000-0000-0000-00000000c17a', 1, 'accepted');

-- ————————————————————————— as Gina —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c17a","role":"authenticated"}', true);

-- The commitment gate. Alex is going to Plan A and Gina can see that she was
-- invited to it — but she has not said yes, so there is nothing to answer.
-- This is the case the old page-view heads-up answered for free, which is what
-- made it an oracle.
select is(
  public.note_give_space_overlap('00000000-0000-0000-0000-0000000ea001'),
  false,
  'no answer for a plan the caller has not accepted'
);
select is(
  (select count(*)::int from public.give_space_notices
    where event_id = '00000000-0000-0000-0000-0000000ea001'),
  0,
  'and nothing is written for one either'
);

-- Plan B: Gina is going, nobody she avoids is.
select is(
  public.note_give_space_overlap('00000000-0000-0000-0000-0000000eb002'),
  false,
  'a plan with no overlap answers false'
);
select is(
  (select warned from public.give_space_notices
    where user_id = '00000000-0000-0000-0000-00000000c17a'
      and event_id = '00000000-0000-0000-0000-0000000eb002'),
  false,
  'and records that it was asked and answered'
);

-- She answers Plan A. Now the question is hers to ask.
reset role;
update public.invites set status = 'accepted'
  where id = '00000000-0000-0000-0000-0000000f0002';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c17a","role":"authenticated"}', true);

select is(
  public.note_give_space_overlap('00000000-0000-0000-0000-0000000ea001'),
  true,
  'committing to a plan someone she avoids is at answers true'
);

-- What crosses is a boolean. The table has no column that could carry a name,
-- a count, or an RSVP status, so no caller can coax one out of it.
select bag_eq(
  $$ select column_name::text from information_schema.columns
      where table_schema = 'public' and table_name = 'give_space_notices' $$,
  $$ values ('user_id'), ('event_id'), ('warned'), ('created_at') $$,
  'the notice carries a boolean and nothing that says who'
);

-- Alex drops out. "They are no longer expected there" is almost as revealing
-- as "they are going", so the notice must not notice.
reset role;
update public.invites set status = 'declined'
  where id = '00000000-0000-0000-0000-0000000f0001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c17a","role":"authenticated"}', true);

select is(
  public.note_give_space_overlap('00000000-0000-0000-0000-0000000ea001'),
  true,
  're-asking after they leave still answers true'
);
select is(
  (select warned from public.give_space_notices
    where user_id = '00000000-0000-0000-0000-00000000c17a'
      and event_id = '00000000-0000-0000-0000-0000000ea001'),
  true,
  'and the stored notice never withdraws itself'
);

-- The row is not self-writable, so nobody can clear their own notice and then
-- re-run the evaluation to find out whether someone has left.
select throws_ok(
  $$ update public.give_space_notices set warned = false
      where user_id = '00000000-0000-0000-0000-00000000c17a' $$,
  '42501',
  null,
  'the owner cannot rewrite their own notice'
);
select throws_ok(
  $$ delete from public.give_space_notices
      where user_id = '00000000-0000-0000-0000-00000000c17a' $$,
  '42501',
  null,
  'nor delete it to start the question over'
);

-- Nobody may ask on somebody else's behalf: the session-bound wrapper is the
-- only thing granted to authenticated, and it substitutes auth.uid() itself.
select throws_ok(
  $$ select public.note_give_space_overlap_for(
       '00000000-0000-0000-0000-00000000c17a',
       '00000000-0000-0000-0000-0000000ea001') $$,
  '42501',
  null,
  'the service-role variant is not reachable from a session'
);

-- ————————————————————————— as Hal, the host —————————————————————————
-- The host approves join requests, which is the one path that runs the
-- decision for somebody else. He must never be able to read the result.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000ba12","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.give_space_notices),
  0,
  'the host of both plans sees no notices at all'
);

select * from finish();
rollback;
