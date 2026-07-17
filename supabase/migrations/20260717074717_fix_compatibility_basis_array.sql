-- Make the compatibility basis array operations explicit. PostgreSQL's
-- polymorphic || overload can otherwise try to assign scalar text to text[].

create or replace function public.compatibility_between(p_other uuid)
returns table (summary text, basis text[])
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
  v_my_fills text;
  v_their_fills text;
  v_my_plan text;
  v_their_plan text;
  v_shared_living text[];
  v_basis text[] := '{}'::text[];
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
    v_basis := array_append(v_basis, 'You both come alive at ' || v_my_fills || ' gatherings');
  end if;
  if v_my_plan is not null and v_my_plan = v_their_plan then
    v_basis := array_append(v_basis, 'You approach plans the same way (' || v_my_plan || ')');
  end if;
  if array_length(v_shared_living, 1) > 0 then
    v_basis := array_append(v_basis, 'You both actually show up for ' ||
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

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260717074717'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
