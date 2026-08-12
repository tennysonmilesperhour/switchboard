-- Poll trees: the decisions that only make sense once an earlier one lands.
--
-- Group planning is a sequence, not a single question. You settle the date, and
-- only then does "where" mean anything; you settle the restaurant, and only then
-- is "what time do we book" answerable. Switchboard could hold exactly one poll
-- per plan (`polls.event_id`, read with `.maybeSingle()`), so every decision
-- after the first one happened somewhere else — the group text the product
-- exists to replace.
--
-- The shape is a tree, not a list, because follow-ups branch: a date poll can
-- unlock both "where" and "what are we eating", and neither blocks the other.
--
--   polls.parent_poll_id  the poll that must land first
--   polls.topic           what this poll is about, for the label and the chain
--   polls.title           the host's own words, when the preset isn't right
--   phase 'pending'       waiting on the parent; not votable, not surfaced
--
-- Unlocking is server-authoritative, exactly like cascade advancement: it runs
-- inside resolve_poll_children, called by the poll runner when a parent is
-- decided (host action or the deadline sweep). A client never advances a poll.
--
-- The anonymity invariant is untouched: every poll in a tree keeps its own
-- author-only `poll_votes` and aggregates through `poll_results()`. A tree is
-- many polls, not one poll with more columns.
--
-- A note on `suggest_deadline`, which the archived MVP ship checklist called
-- vestigial and safe to drop here: it isn't, any more. `create_event_atomic`
-- writes it (20260717120000 onward) and the wizard collects it, so dropping the
-- column would break plan creation. What is true is that nothing ever *acted*
-- on it — a host who set "suggestions close at 6pm" got nothing at 6pm. Rather
-- than drop a column three functions depend on, the sweep now honours it
-- (see sweepDuePolls): at the deadline the poll moves suggesting -> voting, the
-- same transition the host's "Lock suggestions" button performs by hand.

alter table public.polls
  add column if not exists parent_poll_id uuid
    references public.polls(id) on delete cascade,
  add column if not exists topic text not null default 'custom',
  add column if not exists title text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'polls_topic_check'
  ) then
    alter table public.polls
      add constraint polls_topic_check
      check (topic in ('date', 'place', 'food', 'activity', 'custom'));
  end if;
end $$;

-- 'pending' joins the phase vocabulary: a follow-up exists, and is deliberately
-- not askable yet.
alter table public.polls drop constraint if exists polls_phase_check;
alter table public.polls add constraint polls_phase_check
  check (phase in ('pending', 'suggesting', 'voting', 'runoff', 'decided'));

create index if not exists polls_event_idx on public.polls (event_id);
create index if not exists polls_parent_idx on public.polls (parent_poll_id)
  where parent_poll_id is not null;

-- A poll cannot be its own parent. Deeper cycles are impossible by
-- construction: a child is always created after its parent, and
-- `parent_poll_id` is never rewritten (frozen below).
create or replace function public.check_poll_parent()
returns trigger language plpgsql as $$
begin
  if new.parent_poll_id = new.id then
    raise exception 'a poll cannot follow itself';
  end if;
  if tg_op = 'UPDATE' and new.parent_poll_id is distinct from old.parent_poll_id then
    raise exception 'poll order is immutable';
  end if;
  if tg_op = 'UPDATE' and new.event_id is distinct from old.event_id then
    raise exception 'a poll cannot move between plans';
  end if;
  return new;
end $$;

drop trigger if exists polls_check_parent on public.polls;
create trigger polls_check_parent
  before insert or update on public.polls
  for each row execute function public.check_poll_parent();

-- Open every follow-up waiting on a poll that has just been decided.
--
-- Returns the ids it opened so the caller can notify exactly those groups.
-- Only touches children still in 'pending', so a re-run (the cron sweep racing
-- the host's own "close voting") is a no-op rather than a phase reset that
-- would reopen a poll someone had already answered.
create or replace function public.resolve_poll_children(p_poll uuid)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    update public.polls
      set phase = 'suggesting'
      where parent_poll_id = p_poll
        and phase = 'pending'
        and exists (
          select 1 from public.polls parent
          where parent.id = p_poll and parent.phase = 'decided'
        )
      returning id;
end $$;

revoke all on function public.resolve_poll_children(uuid) from public, anon, authenticated;
grant execute on function public.resolve_poll_children(uuid) to service_role;
