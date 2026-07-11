-- Behavioral identity system.
--
-- Most apps model your *stated* self (birth date, the answers you picked).
-- Switchboard already holds the *revealed* self — what you said yes and no to,
-- the circles you actually show up for, and how you felt afterward. This layer
-- turns that behavioral exhaust into a small set of legible "facets".
--
-- Two privacy invariants, enforced here at the database layer:
--   1. `identity_facets` and `facet_prefs` are readable only by their owner.
--      The portrait is a mirror you hold; no one else can query your rows.
--   2. A facet becomes visible to a connection only when you have opted that
--      specific facet into sharing AND they are an accepted connection AND you
--      have not hidden it — all checked inside a security-definer function so a
--      viewer can never read anything you did not deliberately share.
--
-- The facets themselves are computed in TypeScript (src/lib/engine/identity.ts,
-- pure + unit-tested) from rows the owner can already read under RLS, then
-- cached here. This table is a cache: a full recompute may replace every row.

-- ————————————————————————— computed facet cache —————————————————————————
create table public.identity_facets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- 'energy_map' | 'cadence' | 'circle_gravity' | 'interest_alignment'
  facet_key text not null,
  title text not null,
  summary text not null,
  -- structured evidence behind the summary (bucket averages, medians, lists).
  detail jsonb not null default '{}'::jsonb,
  confidence text not null default 'emerging'
    check (confidence in ('emerging', 'clear', 'strong')),
  sample_size int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, facet_key)
);
alter table public.identity_facets enable row level security;

-- Owner-only, full access. No one else — not even connections — reads this
-- table directly; sharing goes exclusively through shared_facets_of().
create policy identity_facets_owner on public.identity_facets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ————————————————————————— per-facet preferences —————————————————————————
-- Kept separate from the cache so a recompute never clobbers the user's
-- hide / share choices. Rows are created lazily the first time a user acts on
-- a facet; absence means "visible to me, shared with no one" (the default).
create table public.facet_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  facet_key text not null,
  -- Hide the facet from the owner's own portrait (a dismissed mirror).
  hidden boolean not null default false,
  -- Opt this facet into being seen by accepted connections as a
  -- revealed-preference signal. Off by default; reversible any time.
  shared_with_connections boolean not null default false,
  -- The collaborative verdict: the model offers each read as a hypothesis the
  -- owner confirms or rejects. A 'rejected' facet is suppressed everywhere —
  -- the owner's own view, reflections, sharing, and compatibility.
  verdict text check (verdict in ('confirmed', 'rejected')),
  updated_at timestamptz not null default now(),
  primary key (user_id, facet_key)
);
alter table public.facet_prefs enable row level security;

create policy facet_prefs_owner on public.facet_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ————————————————————————— consented sharing read —————————————————————————
-- Returns the facets `p_target` has deliberately shared, but only if the caller
-- is an accepted connection of the target. Security-definer so the join can
-- see the target's rows; the WHERE clause is the gate. A target never learns
-- who viewed, and an unshared or hidden facet is simply never returned.
create or replace function public.shared_facets_of(p_target uuid)
returns table (
  facet_key text,
  title text,
  summary text,
  confidence text,
  computed_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select f.facet_key, f.title, f.summary, f.confidence, f.computed_at
  from public.identity_facets f
  join public.facet_prefs p
    on p.user_id = f.user_id and p.facet_key = f.facet_key
  where f.user_id = p_target
    and p.shared_with_connections
    and not p.hidden
    -- A read the owner disowned ("Not quite") is never broadcast, even if the
    -- share toggle was left on — rejection suppresses everywhere.
    and (p.verdict is distinct from 'rejected')
    -- Defense in depth: never surface across a block, mirroring discovery.
    and not public.are_blocked(auth.uid(), p_target)
    and exists (
      select 1 from public.connections c
      where c.status = 'accepted'
        and (
          (c.requester_id = auth.uid() and c.addressee_id = p_target)
          or (c.requester_id = p_target and c.addressee_id = auth.uid())
        )
    )
  order by f.computed_at desc;
$$;

revoke all on function public.shared_facets_of(uuid) from public, anon;
grant execute on function public.shared_facets_of(uuid) to authenticated;
