-- Security fixes (audit findings C1-C3). All changes are additive/idempotent:
-- one RLS policy is tightened, two security-definer functions are added.
--
-- C1  Private-room breach: the room_members_insert policy let ANY authenticated
--     user insert themselves into ANY room (`or member_id = auth.uid()`), which
--     exposed every message/expense/item via the is_room_member() read policies.
--     Every legitimate join goes through the service-role client or the
--     host-is-room-creator branch, so the self-insert branch was pure attack
--     surface. Drop it.
--
-- C2  Arbitrary event cancellation: the "Open to Reschedule" path cancelled an
--     event with the service-role client and NO authorization check. Move the
--     cancel into a security-definer function that verifies the caller both
--     participates in the event AND genuinely has a mutual reschedule match on it.
--
-- C3  Non-atomic guest acceptance: the guest RSVP path hand-rolled a
--     read-then-write capacity check with no lock (TOCTOU race, over-capacity).
--     Route it through a locked security-definer function that mirrors
--     respond_to_invite and shares the same event-row lock, so registered and
--     guest accepts serialize.

-- ————————————————————————— C1 —————————————————————————
drop policy if exists room_members_insert on public.room_members;
create policy room_members_insert on public.room_members for insert to authenticated
  with check (
    exists (select 1 from public.rooms r where r.id = room_id and r.created_by = auth.uid())
  );

-- ————————————————————————— C2 —————————————————————————
-- Cancel an event on a mutual "open to reschedule" match, but only when the
-- caller is a genuine participant (host or invitee) AND actually holds a matched
-- open_to_reschedule intent for this exact event. Runs as the caller so
-- auth.uid() is the acting user.
create or replace function public.reschedule_cancel_event(p_event uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_is_participant boolean;
  v_has_match boolean;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select
    exists (select 1 from public.events e where e.id = p_event and e.host_id = auth.uid())
    or exists (select 1 from public.invites i where i.event_id = p_event and i.invitee_id = auth.uid())
    into v_is_participant;

  select exists (
    select 1 from public.mutual_intents m
    where m.author_id = auth.uid()
      and m.event_id = p_event
      and m.kind = 'open_to_reschedule'
      and m.status = 'matched'
  ) into v_has_match;

  if not (v_is_participant and v_has_match) then
    raise exception 'not authorized to reschedule this event';
  end if;

  update public.events set status = 'cancelled' where id = p_event;
  return true;
end $$;

-- ————————————————————————— C3 —————————————————————————
-- Atomic guest accept/decline keyed by the (unguessable) guest token, which is
-- the guest's credential. Locks the invite and event rows and re-counts under
-- lock, exactly like respond_to_invite, so capacity can never be exceeded.
create or replace function public.respond_to_guest_invite(p_token uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted int;
  v_cap int;
begin
  select * into v_invite from public.invites where guest_token = p_token for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.status <> 'sent' then
    return v_invite.status; -- window closed or already answered
  end if;

  if not p_accept then
    update public.invites set status = 'declined', responded_at = now() where id = v_invite.id;
    return 'declined';
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;

  select count(*) into v_accepted from public.invites
    where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(v_event.capacity, case when v_event.invite_mode = 'individual' then 1 else null end);

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites set status = 'waitlisted', responded_at = now() where id = v_invite.id;
    return 'waitlisted';
  end if;

  update public.invites set status = 'accepted', responded_at = now() where id = v_invite.id;
  return 'accepted';
end $$;
