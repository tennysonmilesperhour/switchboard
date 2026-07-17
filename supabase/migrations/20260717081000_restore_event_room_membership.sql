-- Accepted registered attendees must join the event's Living Room in the same
-- transaction as their RSVP. A prior replacement of these RPCs retained the
-- capacity/status hardening but accidentally dropped the room-membership write.

create or replace function public.respond_to_invite(
  p_invite uuid,
  p_accept boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted integer;
  v_cap integer;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.invitee_id is distinct from auth.uid() then
    raise exception 'not your invite';
  end if;
  if v_invite.status <> 'sent' then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now(), decline_note = p_note
     where id = p_invite;
    return 'declined';
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites
       set status = 'waitlisted', responded_at = now()
     where id = p_invite;
    return 'waitlisted';
  end if;

  update public.invites
     set status = 'accepted', responded_at = now()
   where id = p_invite;

  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;

create or replace function public.respond_to_guest_invite(
  p_token uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted integer;
  v_cap integer;
begin
  select * into v_invite
    from public.invites
   where guest_token = p_token
   for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.status <> 'sent' then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now()
     where id = v_invite.id;
    return 'declined';
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites
       set status = 'waitlisted', responded_at = now()
     where id = v_invite.id;
    return 'waitlisted';
  end if;

  update public.invites
     set status = 'accepted', responded_at = now()
   where id = v_invite.id;

  -- Unregistered guests remain token-only. Once a guest invite has been claimed
  -- by an account, accepting it grants the same room access as a direct invite.
  if v_event.room_id is not null and v_invite.invitee_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;

-- Repair attendees who accepted while the membership write was missing.
insert into public.room_members (room_id, member_id)
select e.room_id, i.invitee_id
  from public.invites i
  join public.events e on e.id = i.event_id
 where i.status = 'accepted'
   and i.invitee_id is not null
   and e.room_id is not null
on conflict do nothing;

revoke all on function public.respond_to_invite(uuid, boolean, text) from public, anon;
grant execute on function public.respond_to_invite(uuid, boolean, text) to authenticated;

revoke all on function public.respond_to_guest_invite(uuid, boolean) from public, anon, authenticated;
grant execute on function public.respond_to_guest_invite(uuid, boolean) to service_role;

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260717081000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
