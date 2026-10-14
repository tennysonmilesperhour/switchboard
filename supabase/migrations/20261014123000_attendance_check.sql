-- "Still coming?" the day before an Open Table.
--
-- Last-minute no-shows are the most common operational complaint about
-- dinners with strangers. An Open Table seat is held by someone the host may
-- never have met, and until now an accepted guest had no way to give a seat
-- back: respond_to_invite only moves 'sent' and 'declined' invites.
--
-- confirm_attendance() is that way, offered only in the 36 hours before an
-- Open Table starts:
--
--   coming      records attendance_confirmed_at, so the host can count on it
--   not coming  declines the seat, leaves the plan's room, and hands the seat
--               to the first person on the waitlist (who joins the room)
--
-- There is no score, streak or public record of who backed out: the only
-- trace is the declined invite the host already sees for any no.

alter table public.invites
  add column if not exists attendance_confirmed_at timestamptz;

-- The window, in one place. Open Tables only: a plan among friends already has
-- a group thread for "running late" and "can't make it".
create or replace function private.attendance_check_open(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event
      and e.open_table
      and e.status in ('inviting', 'confirmed')
      and e.starts_at > now()
      and e.starts_at <= now() + interval '36 hours'
  )
$$;
revoke all on function private.attendance_check_open(uuid) from public, anon, authenticated;
grant execute on function private.attendance_check_open(uuid) to service_role;

-- Returns 'confirmed', or 'released' with the invite that took the seat (null
-- when nobody was waiting). The promoted id stays on the server: the action
-- that calls this notifies that person and never hands the id to the browser.
create function private.confirm_attendance(p_invite uuid, p_coming boolean)
returns table (outcome text, promoted_invite uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_next public.invites%rowtype;
  v_accepted integer;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found
     or v_invite.invitee_id is distinct from auth.uid()
     or v_invite.status <> 'accepted'
     or not private.attendance_check_open(v_invite.event_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if coalesce(p_coming, false) then
    update public.invites set attendance_confirmed_at = now() where id = p_invite;
    return query select 'confirmed'::text, null::uuid;
    return;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;

  update public.invites
     set status = 'declined', responded_at = now(), attendance_confirmed_at = null
   where id = p_invite;
  if v_event.room_id is not null then
    delete from public.room_members
     where room_id = v_event.room_id and member_id = v_invite.invitee_id;
  end if;

  -- The seat goes to whoever has waited longest, if the plan has room for them.
  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  if v_event.capacity is null or v_accepted < v_event.capacity then
    select * into v_next
      from public.invites
     where event_id = v_event.id and status = 'waitlisted'
     order by responded_at nulls last, position
     limit 1
     for update;
    if found then
      update public.invites
         set status = 'accepted', responded_at = now()
       where id = v_next.id;
      if v_event.room_id is not null and v_next.invitee_id is not null then
        insert into public.room_members (room_id, member_id)
        values (v_event.room_id, v_next.invitee_id)
        on conflict do nothing;
      end if;
      return query select 'released'::text, v_next.id;
      return;
    end if;
  end if;

  return query select 'released'::text, null::uuid;
end
$$;

create function public.confirm_attendance(p_invite uuid, p_coming boolean)
returns table (outcome text, promoted_invite uuid)
language sql
set search_path = ''
as $$select * from private.confirm_attendance(p_invite, p_coming)$$;

revoke all on function private.confirm_attendance(uuid, boolean) from public, anon;
revoke all on function public.confirm_attendance(uuid, boolean) from public, anon;
grant execute on function private.confirm_attendance(uuid, boolean) to authenticated, service_role;
grant execute on function public.confirm_attendance(uuid, boolean) to authenticated, service_role;

-- What Home asks about: the caller's accepted Open Table seats inside the
-- window that they have not confirmed yet.
create function private.attendance_checks()
returns table (invite_id uuid, event_id uuid, title text, starts_at timestamptz, time_zone text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, e.id, e.title, e.starts_at, e.time_zone
  from public.invites i
  join public.events e on e.id = i.event_id
  where i.invitee_id = auth.uid()
    and i.status = 'accepted'
    and i.attendance_confirmed_at is null
    and private.attendance_check_open(e.id)
  order by e.starts_at
  limit 3
$$;

create function public.attendance_checks()
returns table (invite_id uuid, event_id uuid, title text, starts_at timestamptz, time_zone text)
language sql
set search_path = ''
as $$select * from private.attendance_checks()$$;

revoke all on function private.attendance_checks() from public, anon;
revoke all on function public.attendance_checks() from public, anon;
grant execute on function private.attendance_checks() to authenticated, service_role;
grant execute on function public.attendance_checks() to authenticated, service_role;
