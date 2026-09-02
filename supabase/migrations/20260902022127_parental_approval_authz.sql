-- Bind a guardian capability to one internally consistent RSVP.
--
-- The application now authorizes creation against the caller's RLS-visible
-- invite before it uses the service role. This database check is the matching
-- defense for resolution: even a malformed row written by privileged code may
-- never use one plan's approval token to mutate another plan's invite.
create or replace function public.resolve_parental_approval(
  p_token text,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval parental_approvals%rowtype;
  v_event events%rowtype;
  v_invite invites%rowtype;
begin
  select * into v_approval
    from parental_approvals
    where token = p_token
    for update;

  if v_approval is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_approval.status <> 'pending' then
    return jsonb_build_object(
      'outcome', 'already_resolved',
      'status', v_approval.status
    );
  end if;

  select * into v_event from events where id = v_approval.event_id;
  if v_event is null then
    return jsonb_build_object('outcome', 'event_gone');
  end if;

  select * into v_invite from invites where id = v_approval.invite_id;
  if v_invite is null then
    return jsonb_build_object('outcome', 'invite_gone');
  end if;

  -- The invite and approval must describe the same plan. Check this before
  -- either table is mutated, so a cross-plan row is inert even under the
  -- SECURITY DEFINER owner.
  if v_invite.event_id is distinct from v_approval.event_id then
    return jsonb_build_object('outcome', 'invite_mismatch');
  end if;

  if p_approve then
    update parental_approvals
      set status = 'approved', responded_at = now()
      where id = v_approval.id;

    return jsonb_build_object(
      'outcome', 'approved',
      'event_title', v_event.title,
      'invite_status', v_invite.status
    );
  end if;

  update parental_approvals
    set status = 'denied', responded_at = now()
    where id = v_approval.id;

  if v_invite.status = 'accepted' then
    update invites
      set status = 'cancelled', responded_at = now()
      where id = v_invite.id;
  end if;

  return jsonb_build_object(
    'outcome', 'denied',
    'event_title', v_event.title
  );
end
$$;

revoke all on function public.resolve_parental_approval(text, boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_parental_approval(text, boolean)
  to anon, authenticated, service_role;
