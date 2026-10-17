-- pgTAP coverage for 20261017120000_poll_result_floor.sql.
--
-- Every voter knows their own ballot. If `poll_results()` hands back exact
-- totals while only two people have voted, either of them subtracts their own
-- ratings and reads the other's exactly, and the live counter on `polls`
-- says when the other one did it. So below three contributing voters the
-- totals are NULL, the counter does not move for a vote, and a closed poll
-- names at most its one clear leader. Walked here with one, two, and three or
-- more voters, including a neutral-only "voter" who must not count as cover.

begin;
select plan(24);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000b301', 'floor-host@example.com'),
  ('00000000-0000-0000-0000-00000000b302', 'floor-one@example.com'),
  ('00000000-0000-0000-0000-00000000b303', 'floor-two@example.com'),
  ('00000000-0000-0000-0000-00000000b304', 'floor-three@example.com'),
  ('00000000-0000-0000-0000-00000000b305', 'floor-four@example.com'),
  ('00000000-0000-0000-0000-00000000b306', 'floor-stranger@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000b301', 'Host', true),
  ('00000000-0000-0000-0000-00000000b302', 'One', true),
  ('00000000-0000-0000-0000-00000000b303', 'Two', true),
  ('00000000-0000-0000-0000-00000000b304', 'Three', true),
  ('00000000-0000-0000-0000-00000000b305', 'Four', true),
  ('00000000-0000-0000-0000-00000000b306', 'Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-00000000b3e0', '00000000-0000-0000-0000-00000000b301', 'Where to?', 'deciding');
insert into public.invites (event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-00000000b3e0', '00000000-0000-0000-0000-00000000b302', 0, 'accepted'),
  ('00000000-0000-0000-0000-00000000b3e0', '00000000-0000-0000-0000-00000000b303', 1, 'accepted'),
  ('00000000-0000-0000-0000-00000000b3e0', '00000000-0000-0000-0000-00000000b304', 2, 'accepted'),
  ('00000000-0000-0000-0000-00000000b3e0', '00000000-0000-0000-0000-00000000b305', 3, 'accepted');
insert into public.polls (id, event_id, phase, allow_suggestions) values
  ('00000000-0000-0000-0000-00000000b3b0', '00000000-0000-0000-0000-00000000b3e0', 'voting', false);
insert into public.poll_options (id, poll_id, label) values
  ('00000000-0000-0000-0000-00000000b3c1', '00000000-0000-0000-0000-00000000b3b0', 'Lake'),
  ('00000000-0000-0000-0000-00000000b3c2', '00000000-0000-0000-0000-00000000b3b0', 'Canyon');

-- Did the live counter move since the last time we asked?
create temporary table tally_probe (version int);
insert into tally_probe
  select tally_version from public.polls where id = '00000000-0000-0000-0000-00000000b3b0';

create or replace function pg_temp.tally_moved() returns boolean language plpgsql as $$
declare
  v_now int;
  v_was int;
begin
  select tally_version into v_now from public.polls where id = '00000000-0000-0000-0000-00000000b3b0';
  select version into v_was from tally_probe;
  update tally_probe set version = v_now;
  return v_now > v_was;
end $$;

-- A ballot, written past RLS: the floor is about what readers see, whoever writes.
create or replace function pg_temp.rate(p_voter text, p_option text, p_weight int) returns void
language sql as $$
  insert into public.poll_votes (poll_id, option_id, voter_id, weight)
  values ('00000000-0000-0000-0000-00000000b3b0', p_option::uuid, p_voter::uuid, p_weight)
  on conflict (option_id, voter_id) do update set weight = excluded.weight;
$$;

-- What a given person reads back, as that person.
create temporary table seen (
  option_id uuid, score bigint, loves bigint, objections bigint, voters bigint,
  revealed boolean, leads boolean
);
grant all on seen to authenticated;

create or replace function pg_temp.read_as(p_user text) returns void language plpgsql as $$
begin
  delete from seen;
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into seen select * from public.poll_results('00000000-0000-0000-0000-00000000b3b0');
  reset role;
end $$;

create or replace function pg_temp.all_hidden() returns boolean language sql as $$
  select count(*) = 2
     and bool_and(not revealed and score is null and loves is null
                  and objections is null and voters is null)
  from seen;
$$;

-- ————————————————————————— nobody has voted ——————————————————————————————
select pg_temp.read_as('00000000-0000-0000-0000-00000000b301');
select ok(pg_temp.all_hidden(), 'with no votes the list renders, every option, with no totals');

-- ————————————————————————— one voter ————————————————————————————————————
select pg_temp.rate('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000b3c1', 2);
select pg_temp.rate('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000b3c2', -1);
select ok(not pg_temp.tally_moved(), 'a lone voter does not move the live counter');

select pg_temp.read_as('00000000-0000-0000-0000-00000000b301');
select ok(pg_temp.all_hidden(), 'with one voter the host sees no totals, so cannot read that ballot');
select is((select count(*)::int from seen where leads), 0, 'nor which idea leads while voting is open');

-- ————————————————————————— two voters ———————————————————————————————————
select pg_temp.rate('00000000-0000-0000-0000-00000000b303', '00000000-0000-0000-0000-00000000b3c1', -1);
select pg_temp.rate('00000000-0000-0000-0000-00000000b303', '00000000-0000-0000-0000-00000000b3c2', 2);
select ok(not pg_temp.tally_moved(), 'the second voter does not move it either: no timing to watch');

select pg_temp.read_as('00000000-0000-0000-0000-00000000b302');
select ok(pg_temp.all_hidden(), 'in a two-person poll there is nothing to subtract your own vote from');

-- A rating tapped twice is a stored 0. It adds nothing to any total, so it
-- cannot be the cover that lets totals show.
select pg_temp.rate('00000000-0000-0000-0000-00000000b304', '00000000-0000-0000-0000-00000000b3c1', 0);
select ok(not pg_temp.tally_moved(), 'a neutral-only voter does not move the counter');
select pg_temp.read_as('00000000-0000-0000-0000-00000000b303');
select ok(pg_temp.all_hidden(), 'and does not count toward the floor');

-- ————————————————————————— three voters —————————————————————————————————
select pg_temp.rate('00000000-0000-0000-0000-00000000b304', '00000000-0000-0000-0000-00000000b3c2', 1);
select ok(pg_temp.tally_moved(), 'reaching the floor moves the counter, so every open page reveals at once');

select pg_temp.read_as('00000000-0000-0000-0000-00000000b301');
select ok((select bool_and(revealed) from seen), 'three contributing voters reveal the totals');
select results_eq(
  $$select score, loves, objections, voters from seen order by option_id$$,
  $$values (1::bigint, 1::bigint, 1::bigint, 3::bigint), (2::bigint, 1::bigint, 1::bigint, 3::bigint)$$,
  'the totals are the exact aggregates once revealed'
);
select is(
  (select option_id from seen where leads),
  '00000000-0000-0000-0000-00000000b3c2'::uuid,
  'and the clear leader is marked'
);

select pg_temp.rate('00000000-0000-0000-0000-00000000b305', '00000000-0000-0000-0000-00000000b3c1', 1);
select ok(pg_temp.tally_moved(), 'above the floor a new vote moves the counter as before');
delete from public.poll_votes
  where voter_id = '00000000-0000-0000-0000-00000000b305'
    and poll_id = '00000000-0000-0000-0000-00000000b3b0';
select ok(pg_temp.tally_moved(), 'withdrawing a vote that leaves three voters moves it too');

-- ————————————————————————— back below the floor ——————————————————————————
select pg_temp.rate('00000000-0000-0000-0000-00000000b304', '00000000-0000-0000-0000-00000000b3c2', 0);
select ok(pg_temp.tally_moved(), 'dropping below the floor moves the counter once, so pages hide at once');
select pg_temp.read_as('00000000-0000-0000-0000-00000000b301');
select ok(pg_temp.all_hidden(), 'and the totals are hidden again');

select pg_temp.rate('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000b3c2', 1);
select ok(not pg_temp.tally_moved(), 'below the floor again, a changed vote is silent');

-- ————————————————————————— closed below the floor ————————————————————————
-- Lake: 2 - 1 = 1. Canyon: 1 + 2 = 3. Canyon leads outright.
update public.polls set phase = 'decided' where id = '00000000-0000-0000-0000-00000000b3b0';
select pg_temp.read_as('00000000-0000-0000-0000-00000000b303');
select ok(pg_temp.all_hidden(), 'a closed poll below the floor still shows no totals');
select is(
  (select option_id from seen where leads),
  '00000000-0000-0000-0000-00000000b3c2'::uuid,
  'but names its one clear leader, so the host can settle it from what the group said'
);

-- Lake: 2 - 1 = 1. Canyon: -1 + 2 = 1. Level on score, objections and loves.
select pg_temp.rate('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000b3c2', -1);
select pg_temp.read_as('00000000-0000-0000-0000-00000000b303');
select is((select count(*)::int from seen where leads), 0, 'a shared lead names nobody');

-- ————————————————————————— who may ask ——————————————————————————————————
select pg_temp.read_as('00000000-0000-0000-0000-00000000b306');
select is((select count(*)::int from seen), 0, 'someone who cannot see the plan gets no rows');

select ok(
  has_function_privilege('authenticated', 'public.poll_results(uuid)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.poll_results(uuid)', 'EXECUTE'),
  'poll_results is for signed-in readers only'
);
select ok(
  not has_function_privilege('authenticated', 'private.poll_contributing_voters(uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.bump_poll_tally_for_vote()', 'EXECUTE')
    and not has_function_privilege('anon', 'private.poll_contributing_voters(uuid)', 'EXECUTE'),
  'the voter count behind the floor is not a client RPC'
);
select is(private.poll_reveal_floor(), 3, 'the floor is three (POLL_REVEAL_FLOOR in scoring.ts)');

select * from finish();
rollback;
