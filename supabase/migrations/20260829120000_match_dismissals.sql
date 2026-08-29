-- Clearing a match off Home.
--
-- "Recent matches" accumulates: every mutual intent lands there and nothing
-- ever takes one away, so the list a tester sees is a pile of things they
-- already acted on months ago. Asked for as "swipe these off the screen, or a
-- check box or something" — the ask is a way to say *I'm done with this one*.
--
-- ————————————————— why this is a table and not a column —————————————————
--
-- A match row is SHARED. `public.matches` has exactly one row per mutual pair,
-- carrying user_a and user_b, and its only policy is a SELECT — the row is
-- written by check_mutual_match() (security definer) and never by a client.
-- A `dismissed` flag on that row would therefore be one person's tap deciding
-- what the OTHER person sees on their own Home screen, which is both wrong and
-- exactly the "no shared state on a self-writable row" hazard docs/SECURITY.md
-- exists to prevent. Dismissal is a private, per-person fact, so it gets its
-- own row keyed by (match, person) and the shared row stays untouched.
--
-- Nothing here is destructive: the match, its room, and its history survive.
-- This hides one card from one person's Home, and `/mutual` still lists
-- everything.

create table if not exists public.match_dismissals (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  dismissed_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create index if not exists match_dismissals_user_idx
  on public.match_dismissals (user_id, match_id);

alter table public.match_dismissals enable row level security;

-- Own rows only, in both directions. `with check` as well as `using`, so no one
-- can write a dismissal in someone else's name and clear a card off their Home.
-- The membership test additionally stops this being used to probe for match ids
-- the caller is not party to: without it, an insert that succeeds tells you a
-- given uuid names a real match, which is the same leak the event_availability
-- policy guards against.
drop policy if exists match_dismissals_own on public.match_dismissals;
create policy match_dismissals_own on public.match_dismissals for all to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and (m.user_a = auth.uid() or m.user_b = auth.uid())
    )
  );

-- Home's list, filtered before it is limited.
--
-- The ordering matters more than it looks. Home asks for three matches; if it
-- fetched three and filtered the dismissed ones out in the client, dismissing
-- one would leave two cards and the fourth-newest match would never appear.
-- Filtering here means clearing a card promotes the next one, which is what
-- "swipe it away" is understood to do everywhere else.
-- Security invoker, deliberately, where my_matchmaker_proposals() next door is
-- definer: that one has to reach `profiles` for another person's display name,
-- and this one touches nothing the caller cannot already select for themselves.
-- So RLS stays switched on underneath it and the auth.uid() filters below are
-- the second lock rather than the only one.
create or replace function public.my_recent_matches(p_limit integer default 3)
returns table (
  id uuid,
  activity text,
  room_id uuid,
  created_at timestamptz
)
language sql stable security invoker set search_path = public as $$
  select m.id, m.activity, m.room_id, m.created_at
  from public.matches m
  where (m.user_a = auth.uid() or m.user_b = auth.uid())
    and not exists (
      select 1 from public.match_dismissals d
      where d.match_id = m.id and d.user_id = auth.uid()
    )
  order by m.created_at desc
  limit greatest(1, least(coalesce(p_limit, 3), 50));
$$;
revoke all on function public.my_recent_matches(integer) from public, anon;
grant execute on function public.my_recent_matches(integer) to authenticated;

comment on table public.match_dismissals is
  'One person''s choice to clear a match off their own Home. Private to that person; the shared matches row and the other party''s view are unaffected.';
