-- pgTAP coverage for 20260921180000_live_poll_suggestions.sql.
--
-- `polls.tally_version` is the only live signal a poll has: PollSection
-- subscribes to the poll's own row and re-fetches the aggregates whenever the
-- counter moves. Until this migration the counter moved for a vote and not for
-- an idea, so a suggestion, an edit, or a removal reached nobody watching the
-- list — the person mid-brainstorm who had not ranked anything yet least of
-- all, since the notification path that stood in for it only reaches the host,
-- co-hosts, and people who have already voted.
--
-- Asserted here rather than only in the app because the counter is the
-- contract: the client cannot subscribe to `poll_options` (it is not in the
-- realtime publication) or to `poll_votes` (author-only, by the anonymity
-- invariant), so if this trigger stops firing the live list silently dies with
-- nothing in the UI to show for it.

begin;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a1001', 'tally-host@example.com'),
  ('00000000-0000-0000-0000-0000000a1002', 'tally-guest@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000a1001', 'Host', true),
  ('00000000-0000-0000-0000-0000000a1002', 'Guest', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000a1e00', '00000000-0000-0000-0000-0000000a1001', 'Saturday?', 'deciding');
insert into public.polls (id, event_id, phase, allow_suggestions) values
  ('00000000-0000-0000-0000-0000000a1b00', '00000000-0000-0000-0000-0000000a1e00', 'suggesting', true);
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-0000000a1f00', '00000000-0000-0000-0000-0000000a1e00', '00000000-0000-0000-0000-0000000a1002', 0, 'accepted');

-- A helper so each assertion reads as "did the counter move?" rather than as
-- arithmetic on a number whose starting value nothing here should depend on.
create temporary table tally_probe (version int);
insert into tally_probe
  select tally_version from public.polls where id = '00000000-0000-0000-0000-0000000a1b00';

create or replace function pg_temp.tally_moved() returns boolean language plpgsql as $$
declare
  v_now int;
  v_was int;
begin
  select tally_version into v_now from public.polls where id = '00000000-0000-0000-0000-0000000a1b00';
  select version into v_was from tally_probe;
  update tally_probe set version = v_now;
  return v_now > v_was;
end $$;

-- ————————————————————————— a new idea ———————————————————————————————————
insert into public.poll_options (id, poll_id, author_id, label) values
  ('00000000-0000-0000-0000-0000000a1c01'::uuid,
   '00000000-0000-0000-0000-0000000a1b00',
   '00000000-0000-0000-0000-0000000a1002',
   'Greek festival');

select ok(pg_temp.tally_moved(), 'suggesting an idea moves the poll''s live counter');

-- ————————————————————————— an edit (J1) —————————————————————————————————
update public.poll_options set label = 'Greek festival, Saturday'
  where id = '00000000-0000-0000-0000-0000000a1c01'::uuid;

select ok(pg_temp.tally_moved(), 'editing an idea moves it too, so a fixed typo reaches everyone');

-- ————————————————————————— a vote, as before ————————————————————————————
insert into public.poll_votes (poll_id, option_id, voter_id, weight) values
  ('00000000-0000-0000-0000-0000000a1b00',
   '00000000-0000-0000-0000-0000000a1c01'::uuid,
   '00000000-0000-0000-0000-0000000a1002',
   1);

select ok(pg_temp.tally_moved(), 'a vote still moves the counter — the original signal is intact');

-- ————————————————————————— a removal ————————————————————————————————————
delete from public.poll_options where id = '00000000-0000-0000-0000-0000000a1c01'::uuid;

select ok(pg_temp.tally_moved(), 'removing an idea moves the counter, so it leaves every list at once');

-- ————————————————————————— the signal stays a bare integer ———————————————
-- `poll_options` must NOT be published for realtime: the counter is the whole
-- exposure, and publishing the table would put idea text and its author on a
-- channel of their own.
select is(
  (select count(*)::int
     from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('poll_options', 'poll_votes')),
  0,
  'neither poll_options nor poll_votes is published — only the counter crosses'
);

select * from finish();
rollback;
