-- Anonymous moment discovery must honor blocks in both directions. The raw
-- moments table stays owner-only; this definer is the sole pre-consent
-- cross-user surface, so filtering here protects pages, RPC callers, and the
-- server actions that revalidate candidate moment ids.
create or replace function public.find_shared_moments(p_place text)
returns table (id uuid, experiences text[], headline text)
language sql
stable
security definer
set search_path = public
as $$
  -- `headline` is free text promised only after mutual curiosity. Preserve the
  -- function's established return shape for clients, but never populate that
  -- field on the anonymous discovery surface.
  select m.id, m.experiences, null::text as headline
  from public.moments m
  where lower(m.place_name) = lower(p_place)
    and m.status = 'open'
    and m.available_until > now()
    and m.user_id <> auth.uid()
    and not public.are_blocked(auth.uid(), m.user_id)
    and exists (
      select 1
      from public.moments mine
      where mine.user_id = auth.uid()
        and lower(mine.place_name) = lower(p_place)
        and mine.status = 'open'
        and mine.available_until > now()
    );
$$;

revoke all on function public.find_shared_moments(text) from public, anon;
grant execute on function public.find_shared_moments(text) to authenticated;
