-- Repair identity-system objects for environments whose migration history marks
-- 20260711120000 as applied but where the cache/preference objects are absent.

create table if not exists public.identity_facets (
  user_id uuid not null references public.profiles(id) on delete cascade,
  facet_key text not null,
  title text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  confidence text not null default 'emerging'
    check (confidence in ('emerging', 'clear', 'strong')),
  sample_size int not null default 0,
  computed_at timestamptz not null default now(),
  primary key (user_id, facet_key)
);
alter table public.identity_facets enable row level security;

drop policy if exists identity_facets_owner on public.identity_facets;
create policy identity_facets_owner on public.identity_facets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create table if not exists public.facet_prefs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  facet_key text not null,
  hidden boolean not null default false,
  shared_with_connections boolean not null default false,
  verdict text check (verdict in ('confirmed', 'rejected')),
  updated_at timestamptz not null default now(),
  primary key (user_id, facet_key)
);
alter table public.facet_prefs enable row level security;

drop policy if exists facet_prefs_owner on public.facet_prefs;
create policy facet_prefs_owner on public.facet_prefs
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

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
    and (p.verdict is distinct from 'rejected')
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
