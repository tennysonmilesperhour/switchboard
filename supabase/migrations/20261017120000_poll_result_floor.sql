-- Poll totals need a floor before any number crosses.
--
-- `poll_results()` (20260703120000_init.sql, moved behind a private definer
-- body by 20260717192758) returned exact per-option score, loves, objections
-- and voters to anyone who could view the plan, from the first vote onward.
-- Every voter knows their own ballot, so in a two-person poll either person
-- could subtract it from the totals and read the other's vote exactly. In
-- general the votes fall out whenever all but one voter compare notes. That
-- broke the shipped promise "Nobody sees your vote" (features.ts, id
-- `vote-privacy`) and the README's anonymity invariant for `poll_votes`.
--
-- What changes:
--
--   * A floor. `private.poll_reveal_floor()` is 3. A poll counts the distinct
--     people who have at least one non-zero rating on it. Below the floor
--     `poll_results()` still returns one row per option (so the list renders)
--     but score, loves, objections and voters are NULL and `revealed` is false.
--     A neutral 0 is what tapping a rating twice leaves behind; it adds nothing
--     to the totals, so it cannot be the cover that lets the totals show.
--   * One coarse fact once the poll closes. When a poll is decided below the
--     floor, `leads` marks the option that leads on everything the ranking
--     weighs (score, then fewest objections, then most loves), and only when
--     exactly one does. No number. That is what the host needs to settle a
--     host-pick poll "from what the group said", and it is no more than an
--     auto-resolved poll already publishes as its winner.
--   * The live counter keeps quiet below the floor. `polls.tally_version` is
--     published for realtime (20260708130000) and used to bump on every vote,
--     so in a small group the moment it moved said who had just voted, while
--     there was nothing new on screen to justify the signal. A vote now bumps
--     it only when the poll was or is at the floor, i.e. only when what
--     `poll_results()` shows can have changed. Crossing the floor in either
--     direction still bumps, so every open page reveals or hides at once.
--     Changes to the ideas themselves keep the old trigger: an idea is visible
--     to everyone anyway.
--
-- Resolution below the floor is decided in the app (poll-runner.ts,
-- scoring.ts `decidePoll`): auto still crowns a clear leader (one option, no
-- counts), and a runoff poll skips the narrowing round, because publishing a
-- top-three cut of fewer than three people's ballots tells each of them more
-- about the others than a single winner does.

-- ————————————————————————— the floor ———————————————————————————————————
create or replace function private.poll_reveal_floor()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

revoke all on function private.poll_reveal_floor() from public, anon, authenticated;
grant execute on function private.poll_reveal_floor() to service_role;

-- Distinct people with at least one non-zero rating on the poll. Not a
-- definer: only definer bodies below call it, and they run as the owner.
create or replace function private.poll_contributing_voters(p_poll uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(distinct v.voter_id)::integer
  from public.poll_votes v
  where v.poll_id = p_poll
    and v.weight <> 0;
$$;

revoke all on function private.poll_contributing_voters(uuid) from public, anon, authenticated;
grant execute on function private.poll_contributing_voters(uuid) to service_role;

-- ————————————————————————— poll_results ——————————————————————————————————
-- The result shape changes, which `create or replace` cannot do. Drop the
-- public invoker wrapper first: it depends on the private body.
drop function if exists public.poll_results(uuid);
drop function if exists private.poll_results(uuid);

create function private.poll_results(p_poll uuid)
returns table (
  option_id uuid,
  score bigint,
  loves bigint,
  objections bigint,
  voters bigint,
  revealed boolean,
  leads boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with poll as (
    select
      p.id,
      p.phase,
      private.poll_contributing_voters(p.id) as contributors
    from public.polls p
    where p.id = p_poll
      and public.can_view_event(p.event_id, auth.uid())
  ),
  tally as (
    select
      o.id as option_id,
      coalesce(sum(v.weight), 0)::bigint as score,
      count(*) filter (where v.weight = 2) as loves,
      count(*) filter (where v.weight = -1) as objections,
      count(v.voter_id) as voters
    from poll
    join public.poll_options o on o.poll_id = poll.id
    left join public.poll_votes v on v.option_id = o.id
    group by o.id
  ),
  ranked as (
    select
      t.*,
      rank() over (order by t.score desc, t.objections asc, t.loves desc) as standing,
      count(*) over (partition by t.score, t.objections, t.loves) as level_with
    from tally t
  )
  select
    r.option_id,
    case when shown.revealed then r.score end,
    case when shown.revealed then r.loves end,
    case when shown.revealed then r.objections end,
    case when shown.revealed then r.voters end,
    shown.revealed,
    -- Above the floor this is derivable from the numbers anyway. Below it,
    -- only a decided poll names its leader, and only an unshared lead counts.
    (shown.revealed or poll.phase = 'decided')
      and poll.contributors > 0
      and r.standing = 1
      and r.level_with = 1
  from ranked r
  cross join poll
  cross join lateral (
    select poll.contributors >= private.poll_reveal_floor() as revealed
  ) shown;
$$;

revoke all on function private.poll_results(uuid) from public, anon;
grant execute on function private.poll_results(uuid) to authenticated, service_role;

create function public.poll_results(p_poll uuid)
returns table (
  option_id uuid,
  score bigint,
  loves bigint,
  objections bigint,
  voters bigint,
  revealed boolean,
  leads boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.poll_results(p_poll);
$$;

revoke all on function public.poll_results(uuid) from public, anon;
grant execute on function public.poll_results(uuid) to authenticated, service_role;

-- ————————————————————————— the live counter ——————————————————————————————
-- Bump only when the poll was or is at the floor. The row being changed is
-- already applied when an AFTER trigger runs, so "now" is a plain count and
-- "before" adjusts it for this one voter: did they contribute before this row
-- changed (another non-zero rating, or this row's old weight), and do they
-- now? A bulk statement (a runoff clearing every ballot, an account deletion)
-- sees the end state on each row, which can only add bumps, never hide one
-- that changes what is shown, and the runoff's own phase change bumps the row.
create or replace function private.bump_poll_tally_for_vote()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll uuid := coalesce(new.poll_id, old.poll_id);
  v_voter uuid := coalesce(new.voter_id, old.voter_id);
  v_floor integer := private.poll_reveal_floor();
  v_now integer := private.poll_contributing_voters(v_poll);
  v_voter_now boolean;
  v_voter_before boolean;
begin
  if v_now < v_floor then
    select exists (
      select 1 from public.poll_votes v
      where v.poll_id = v_poll and v.voter_id = v_voter and v.weight <> 0
    ) into v_voter_now;

    select exists (
      select 1 from public.poll_votes v
      where v.poll_id = v_poll
        and v.voter_id = v_voter
        and v.weight <> 0
        and v.option_id is distinct from new.option_id
    ) or (tg_op <> 'INSERT' and old.poll_id = v_poll and old.weight <> 0)
    into v_voter_before;

    if v_now - v_voter_now::integer + v_voter_before::integer < v_floor then
      return null;
    end if;
  end if;

  update public.polls set tally_version = tally_version + 1 where id = v_poll;
  return null;
end $$;

revoke all on function private.bump_poll_tally_for_vote() from public, anon, authenticated;
grant execute on function private.bump_poll_tally_for_vote() to service_role;

drop trigger if exists on_poll_vote_change on public.poll_votes;
create trigger on_poll_vote_change
  after insert or update or delete on public.poll_votes
  for each row execute function private.bump_poll_tally_for_vote();
