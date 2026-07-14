-- Identity, part two: the operator layer.
--
-- The mirror (part one) shows you yourself. The operator lets you *act* on it —
-- but only ever by explicit, per-behavior opt-in. The consent to SEE a pattern
-- and the consent to be ACTED ON by it are different consents; nothing here
-- turns on by itself.
--
-- Three additions:
--   1. A collaborative verdict on each facet. The model offers every read as a
--      hypothesis you confirm or reject, never a verdict it hands down. A
--      rejected facet is suppressed and the rejection is kept as signal.
--   2. `operator_settings`: opt-in operator behaviors and optional facet
--      features (divergence, compatibility), keyed by string, all off by default.
--   3. `identity_reflections`: on-request, deeper narrative reflections — cached
--      so a user can revisit them.
-- Plus a consented cross-user compatibility read.

-- The collaborative verdict column lives with facet_prefs in the first identity
-- migration; the confirm/reject spine and its suppression rules are enforced
-- there and in the functions below.

-- ————————————————————————— opt-in operator layer —————————————————————————
create table public.operator_settings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- e.g. 'facet_divergence', 'facet_compatibility', 'tune_windows',
  -- 'capacity_guard', 'discovery_fills_you'
  setting_key text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, setting_key)
);
alter table public.operator_settings enable row level security;
create policy operator_settings_owner on public.operator_settings
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ————————————————————————— on-request reflections —————————————————————————
create table public.identity_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'general'
    check (kind in ('general', 'relationships', 'desires')),
  body text not null,
  -- 'ai' when a model wrote it, 'fallback' when the deterministic path did.
  source text not null default 'ai' check (source in ('ai', 'fallback')),
  created_at timestamptz not null default now()
);
alter table public.identity_reflections enable row level security;
create policy identity_reflections_owner on public.identity_reflections
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Whether a facet still counts — not hidden and not rejected by its owner.
-- A missing prefs row means "live" (the defaults). Definer-internal only:
-- deliberately NOT granted to authenticated, so it can't be used to probe
-- whether another user has hidden or disowned a given facet; the security-
-- definer functions below own it and can call it regardless.
create or replace function public.facet_live(p_user uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.facet_prefs pp
    where pp.user_id = p_user and pp.facet_key = p_key
      and (pp.hidden or pp.verdict = 'rejected')
  );
$$;
revoke all on function public.facet_live(uuid, text) from public, anon;

-- ———————————————————————— consented compatibility ————————————————————————
-- A one-line compatibility read between the caller and `p_other`, computed
-- server-side from both users' cached facets. Returns a row ONLY when the two
-- are accepted connections AND both have turned on 'facet_compatibility'.
-- Neither user's underlying evidence ever leaves the database — the caller
-- receives only the resulting summary and the plain-language basis for it.
create or replace function public.compatibility_between(p_other uuid)
returns table (summary text, basis text[])
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
  v_my_fills text;
  v_their_fills text;
  v_my_plan text;
  v_their_plan text;
  v_shared_living text[];
  v_basis text[] := '{}';
begin
  if v_me is null or p_other is null or v_me = p_other then
    return;
  end if;

  select
    exists (
      select 1 from public.connections c
      where c.status = 'accepted'
        and ((c.requester_id = v_me and c.addressee_id = p_other)
          or (c.requester_id = p_other and c.addressee_id = v_me))
    )
    and not public.are_blocked(v_me, p_other)
    and exists (
      select 1 from public.operator_settings s
      where s.user_id = v_me and s.setting_key = 'facet_compatibility' and s.enabled
    )
    and exists (
      select 1 from public.operator_settings s
      where s.user_id = p_other and s.setting_key = 'facet_compatibility' and s.enabled
    )
  into v_ok;

  if not v_ok then
    return;
  end if;

  -- A facet only contributes if BOTH people still stand behind it — a hidden or
  -- rejected facet is suppressed from the shared read exactly as it is elsewhere.
  -- The `facet_ok` guard below yields NULL for a suppressed facet, which then
  -- fails the equality checks and drops out of the basis.
  select detail->>'fills' into v_my_fills
  from public.identity_facets f where f.user_id = v_me and f.facet_key = 'energy_map'
    and public.facet_live(v_me, 'energy_map');
  select detail->>'fills' into v_their_fills
  from public.identity_facets f where f.user_id = p_other and f.facet_key = 'energy_map'
    and public.facet_live(p_other, 'energy_map');

  select detail->>'planningStyle' into v_my_plan
  from public.identity_facets f where f.user_id = v_me and f.facet_key = 'cadence'
    and public.facet_live(v_me, 'cadence');
  select detail->>'planningStyle' into v_their_plan
  from public.identity_facets f where f.user_id = p_other and f.facet_key = 'cadence'
    and public.facet_live(p_other, 'cadence');

  -- Interests you both not only claim but actually turn out for.
  select array(
    select x from (
      select jsonb_array_elements_text(a.detail->'living') as x
      from public.identity_facets a
      where a.user_id = v_me and a.facet_key = 'interest_alignment'
        and public.facet_live(v_me, 'interest_alignment')
      intersect
      select jsonb_array_elements_text(b.detail->'living')
      from public.identity_facets b
      where b.user_id = p_other and b.facet_key = 'interest_alignment'
        and public.facet_live(p_other, 'interest_alignment')
    ) q
  ) into v_shared_living;

  if v_my_fills is not null and v_my_fills = v_their_fills then
    v_basis := v_basis || ('You both come alive at ' || v_my_fills || ' gatherings');
  end if;
  if v_my_plan is not null and v_my_plan = v_their_plan then
    v_basis := v_basis || ('You approach plans the same way (' || v_my_plan || ')');
  end if;
  if array_length(v_shared_living, 1) > 0 then
    v_basis := v_basis || ('You both actually show up for ' ||
      array_to_string(v_shared_living[1:3], ', '));
  end if;

  if array_length(v_basis, 1) is null then
    return;
  end if;

  summary := array_to_string(v_basis, '; ') || '.';
  basis := v_basis;
  return next;
end $$;

revoke all on function public.compatibility_between(uuid) from public, anon;
grant execute on function public.compatibility_between(uuid) to authenticated;
