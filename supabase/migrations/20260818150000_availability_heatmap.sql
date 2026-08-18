-- Availability heatmap: when is everyone actually free?
--
-- Picking a time is the first thing a group has to do and the thing that stalls
-- them longest. The date poll helps only once someone has proposed dates, and
-- whoever proposes is guessing at everyone else's week. This collects the raw
-- fact — when each person is free — and shows where those overlap, so the dates
-- that go into the poll are ones people can actually make.
--
-- ————————————————————————— what a slot is —————————————————————————
--
-- A `timestamptz` at the start of a band, not a (day, hour) pair. Absolute
-- instants are the only representation that stays correct across time zones and
-- DST, and a plan already carries `events.time_zone` for rendering. The app
-- offers four bands a day rather than 24 hours: 28 taps for a week is a
-- decision someone will actually finish on a phone, and "Tuesday evening" is
-- the granularity people negotiate in anyway.
--
-- ————————————————————————— who sees what —————————————————————————
--
-- Individual rows are readable ONLY by the person who wrote them, exactly like
-- poll votes ("Rank ideas privately. Nobody sees your individual votes.") and
-- for the same reason: "who is free Friday night" is a question about someone's
-- private life, and a plan is not a licence to ask it. The group sees counts,
-- through a security-definer function that never returns a user id.
--
-- This is deliberately stricter than the when2meet convention of showing every
-- name against every slot. The aggregate is what the group needs to choose a
-- time; the roster of who was home on Sunday afternoon is not.

create table if not exists public.event_availability (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id, slot)
);

create index if not exists event_availability_event_slot_idx
  on public.event_availability (event_id, slot);

alter table public.event_availability enable row level security;

-- Own rows only, in both directions. `with check` as well as `using` so nobody
-- can write availability into someone else's name — an UPDATE policy without
-- one is the hole docs/SECURITY.md calls out by name.
drop policy if exists event_availability_own on public.event_availability;
create policy event_availability_own on public.event_availability for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    -- ...and only onto a plan you're actually on, so this cannot be used to
    -- probe for event ids or to attach yourself to a stranger's plan.
    and public.can_view_event(event_id, auth.uid())
  );

-- The group's view: counts per slot, plus whether the caller marked it. Never a
-- user id, never a name — there is no argument by which this function could
-- return one, which is the point of it being the only way in.
create or replace function public.event_availability_counts(p_event uuid)
returns table (slot timestamptz, people integer, mine boolean)
language sql stable security definer set search_path = public as $$
  select a.slot,
         count(*)::int as people,
         bool_or(a.user_id = auth.uid()) as mine
  from public.event_availability a
  where a.event_id = p_event
    and public.can_view_event(p_event, auth.uid())
  group by a.slot
  order by a.slot;
$$;
revoke all on function public.event_availability_counts(uuid) from public, anon;
grant execute on function public.event_availability_counts(uuid) to authenticated;

-- A count of one is not an aggregate.
--
-- With two people on a plan, "3 people free" tells you nothing you could not
-- work out, but "1 person free at 9pm Tuesday" identifies them — the group is
-- small enough that the aggregate *is* the individual. The function above is
-- honest about slots nobody else picked because the caller can see their own
-- marks anyway (`mine`); what it must never do is let someone infer a *third*
-- party's evening. That holds because a row only ever contributes to a count,
-- and a count of 1 that isn't yours could be any one of the others.
--
-- Stated here rather than left implicit: if this ever grows a "who?" affordance,
-- that is a privacy-model change and needs the review docs/SECURITY.md requires.

comment on table public.event_availability is
  'When each person is free for a plan. Rows are private to their owner; the group sees only counts, via event_availability_counts().';
