-- A co-host who was also invited counts as going.
--
-- Found walking the app on 2026-10-02: someone made co-host before answering
-- their invitation had no RSVP card (the plan page treats anyone who can
-- manage the plan as a host), so their invitation sat at "sent" and, on a
-- timed line, lapsed to "No response" while they were helping run the plan.
-- The page now shows them the card; this makes the act of handing someone
-- the plan also put them down as going, which they can still change.
--
-- Only the primary host may ask, only for someone already on the co-host
-- list, and only through the same rules an RSVP follows: a plan on a guardian
-- hold keeps its hold (no seat until a guardian approves), and a full plan is
-- left alone rather than waitlisting someone who never asked to be.

create or replace function private.accept_cohost_invite(p_event uuid, p_cohost uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events%rowtype;
  v_invite public.invites%rowtype;
  v_accepted integer;
  v_cap integer;
begin
  select * into v_event from public.events where id = p_event for update;
  if not found then return 'missing'; end if;
  if v_event.host_id is distinct from (select auth.uid()) then
    raise exception 'only the host can do that' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.event_cohosts c
     where c.event_id = p_event and c.cohost_id = p_cohost
  ) then
    raise exception 'not a co-host of this plan' using errcode = '42501';
  end if;

  select * into v_invite
    from public.invites
   where event_id = p_event
     and invitee_id = p_cohost
     and status in ('sent', 'queued')
   order by position
   limit 1
   for update;
  if not found then return 'no_open_invite'; end if;

  -- Invitations only take answers while the plan is out; a date still being
  -- polled sends nothing yet, and a finished plan takes no new yes.
  if v_event.status <> 'inviting' then return v_invite.status; end if;
  if v_event.parental_approval then return v_invite.status; end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = p_event and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );
  if v_cap is not null and v_accepted >= v_cap then return 'full'; end if;

  update public.invites
     set status = 'accepted', responded_at = now()
   where id = v_invite.id;

  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, p_cohost)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;

revoke all on function private.accept_cohost_invite(uuid, uuid) from public, anon;
grant execute on function private.accept_cohost_invite(uuid, uuid)
  to authenticated, service_role;

create or replace function public.accept_cohost_invite(p_event uuid, p_cohost uuid)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$ select private.accept_cohost_invite(p_event, p_cohost) $$;

revoke all on function public.accept_cohost_invite(uuid, uuid) from public, anon;
grant execute on function public.accept_cohost_invite(uuid, uuid) to authenticated;
