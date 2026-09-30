-- Plan polish (completion plan G20, G21 / D17, G22 / D18, G28).
--
--   1. Open Table: turning a request down goes through one host-checked door
--      that says whose request it was, so the app can tell them (G20). It used
--      to be a bare DELETE, and the requester — promised "you'll hear back
--      either way" on /join — heard nothing.
--   2. Response windows: a host may lengthen a live invitation's window while
--      the plan is inviting (D17). Only a window that has not run out, only
--      longer, never shorter.
--   3. A changed mind: an in-app invitee who said no may say yes after all
--      while the plan is inviting (D17). Never over a guardian's no.
--   4. What stays fixed after creation (D18): parental approval and
--      recurrence cannot be changed from the browser.
--   5. The Memory Capsule takes lines only from people who went and the
--      people who ran the plan (G28).
--
-- `private.respond_to_invite` is redefined here. Its latest definition was
-- 20260930011000_guardian_hold.sql; this copy starts from that one and keeps
-- the guardian hold (`pending_approval`) exactly as it was.

-- ————————————————————————— 1. turning down a join request —————————————————————
-- Host or co-host only, and only a request still waiting (`requested`): an
-- approved, waitlisted or held request is an answer already given, and the
-- caller is told nothing changed (null) rather than handed someone's seat to
-- delete. Returns the requester's id so the server can let them know.
--
-- The row is deleted, as before, rather than kept as `declined`: a declined
-- invitation may now be re-answered (section 3), and `can_view_event` admits
-- any invitee who is not queued. A kept row would let the person the host
-- turned away say yes to themselves and keep reading the plan.
create or replace function private.decline_join_request(p_invite uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then
    return null;
  end if;
  -- Who is asking comes before what state the row is in, so a caller who does
  -- not run this plan learns nothing about its requests.
  if not private.is_event_host(v_invite.event_id, auth.uid()) then
    raise exception 'host only';
  end if;
  if v_invite.status <> 'requested' then
    return null;
  end if;

  delete from public.invites where id = p_invite;
  return v_invite.invitee_id;
end;
$$;

revoke all on function private.decline_join_request(uuid) from public, anon;
grant execute on function private.decline_join_request(uuid)
  to authenticated, service_role;

create or replace function public.decline_join_request(p_invite uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.decline_join_request(p_invite) $$;

revoke all on function public.decline_join_request(uuid) from public, anon;
grant execute on function public.decline_join_request(uuid)
  to authenticated, service_role;

-- ————————————————————————— 2. more time for a live invitation (D17) ————————————
-- Copied from 20260711130000_cascade_editing.sql (moved to `private` by
-- 20260717192758, search_path pinned by 20260717071754). A queued invite is
-- re-timed exactly as before. A sent one may be given MORE time, and only:
--   * while the plan is inviting — the cascade runs in no other status, so a
--     longer window anywhere else would change nothing but the row;
--   * to a window longer than the one it has — shortening a live invitation
--     would pull the clock out from under someone who is still deciding;
--   * while it has not already run out — a window that ended has moved the
--     line on (or is about to), and reviving it is what Resend is for.
-- The invite row is locked, so the check and the write cannot come apart.
create or replace function private.set_invite_window(p_invite uuid, p_minutes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_event_status text;
begin
  if p_minutes is null or p_minutes < 1 then
    raise exception 'window must be a positive number of minutes';
  end if;
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then raise exception 'invite not found'; end if;
  if not public.is_event_host(v_invite.event_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  if v_invite.status = 'queued' then
    update public.invites set window_minutes = p_minutes where id = p_invite;
    return;
  end if;

  if v_invite.status <> 'sent' then
    raise exception 'only an invitation still waiting on an answer can be re-timed'
      using hint = 'window_answered';
  end if;

  select status into v_event_status from public.events where id = v_invite.event_id;
  if v_event_status is distinct from 'inviting' then
    raise exception 'windows can only be extended while invitations are going out'
      using hint = 'window_not_inviting';
  end if;
  if p_minutes <= v_invite.window_minutes then
    raise exception 'a live invitation can only be given more time'
      using hint = 'window_not_longer';
  end if;
  if v_invite.sent_at is null
     or v_invite.sent_at + make_interval(mins => v_invite.window_minutes) <= now() then
    raise exception 'this invitation''s window has already run out'
      using hint = 'window_expired';
  end if;

  update public.invites set window_minutes = p_minutes where id = p_invite;
end;
$$;

revoke all on function private.set_invite_window(uuid, integer) from public, anon;
grant execute on function private.set_invite_window(uuid, integer)
  to authenticated, service_role;

-- ————————————————————————— 3. changing a no to a yes (D17) ——————————————————————
-- From 20260930011000_guardian_hold.sql. Two changes, both marked below:
--   * a `declined` invite may be answered again while the plan is inviting —
--     a yes goes through the same capacity check, guardian hold and room
--     membership as a first answer; a second no changes nothing;
--   * a no that was the guardian's (the invite's most recent approval request
--     was denied — the same rule the plan page uses to show "your guardian
--     didn't approve", `guardianStepFor`) stays a no. The minor cannot
--     re-litigate it from the plan page.
-- Everything else — the invitee check, the status guard on the plan, the
-- guardian hold, the capacity rule — is unchanged.
create or replace function private.respond_to_invite(
  p_invite uuid,
  p_accept boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
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
  -- Changed (D17): a no can be revisited, nothing else can.
  if v_invite.status not in ('sent', 'declined') then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status;
  end if;

  -- Changed (D17): a second no is not an answer to record, and a guardian's
  -- no is not the invitee's to take back.
  if v_invite.status = 'declined' then
    if not p_accept then
      return 'declined';
    end if;
    if (
      select a.status from public.parental_approvals a
       where a.invite_id = v_invite.id
       order by a.created_at desc, a.id desc
       limit 1
    ) = 'denied' then
      return 'declined';
    end if;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now(), decline_note = p_note
     where id = p_invite;
    return 'declined';
  end if;

  -- Guardian hold (D2): no seat, no room, until a guardian approves.
  if v_event.parental_approval then
    update public.invites
       set status = 'pending_approval', responded_at = now(),
           decline_note = null, decline_message = null
     where id = p_invite;
    return 'pending_approval';
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
       set status = 'waitlisted', responded_at = now(),
           decline_note = null, decline_message = null
     where id = p_invite;
    return 'waitlisted';
  end if;

  -- A yes that follows a no leaves nothing of the no behind: the host's line
  -- would otherwise show "ask me again!" and a decline note beside a guest who
  -- is coming.
  update public.invites
     set status = 'accepted', responded_at = now(),
         decline_note = null, decline_message = null
   where id = p_invite;

  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;

revoke all on function private.respond_to_invite(uuid, boolean, text) from public, anon;
grant execute on function private.respond_to_invite(uuid, boolean, text)
  to authenticated, service_role;

-- ————————————————————————— 4. what stays fixed (D18) ——————————————————————————
-- The edit form now changes the cover, questions, reminders, theme and Open
-- Table. Parental approval and recurrence are the plan's founding rules: a
-- youth plan whose guardian requirement could be switched off after minors
-- said yes — by the host or by any co-host, straight through the API, since
-- `events_update` admits both — would take the one safeguard those yeses were
-- given under. So the browser roles cannot change either column. Server-side
-- roles (service role, migrations, operators) still can, which is what the
-- plan's own fixtures and any support correction need.
create or replace function private.freeze_event_founding_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
    new.parental_approval is distinct from old.parental_approval
    or new.recurrence is distinct from old.recurrence
    or new.recurrence_interval_days is distinct from old.recurrence_interval_days
  ) then
    raise exception 'parental approval and recurrence are set when a plan is made'
      using hint = 'SB-PLAN-SAVE';
  end if;
  return new;
end;
$$;

revoke all on function private.freeze_event_founding_rules() from public, anon, authenticated;
grant execute on function private.freeze_event_founding_rules() to service_role;

drop trigger if exists events_freeze_founding_rules on public.events;
create trigger events_freeze_founding_rules
  before update of parental_approval, recurrence, recurrence_interval_days
  on public.events
  for each row
  execute function private.freeze_event_founding_rules();

-- ————————————————————————— 5. who writes the capsule (G28) ——————————————————————
-- The capsule is "one line and one photo from everyone who was there". The
-- write policies only asked `can_view_event`, which admits every invitee who is
-- not queued — so someone who declined, expired, or was still waiting on a
-- guardian could write the record of a night they did not attend. Now a line
-- needs an accepted invitation to this plan, or to be its host or a co-host.
-- Reading is unchanged: anyone who can see the plan can read its capsule.
create or replace function private.can_add_to_capsule(p_event uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    private.is_event_host(p_event, p_user)
    or exists (
      select 1 from public.invites i
      where i.event_id = p_event
        and i.invitee_id = p_user
        and i.status = 'accepted'
    )
  );
$$;

revoke all on function private.can_add_to_capsule(uuid, uuid) from public, anon;
grant execute on function private.can_add_to_capsule(uuid, uuid)
  to authenticated, service_role;

-- Caller-bound, like `is_connected_with`: the page asks whether the reader may
-- write, and nobody can ask whether somebody else went.
create or replace function public.can_current_user_add_to_capsule(p_event uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$ select private.can_add_to_capsule(p_event, auth.uid()) $$;

revoke all on function public.can_current_user_add_to_capsule(uuid) from public, anon;
grant execute on function public.can_current_user_add_to_capsule(uuid)
  to authenticated, service_role;

alter policy capsule_insert on public.capsule_entries
  with check (
    user_id = (select auth.uid())
    and private.can_add_to_capsule(event_id, (select auth.uid()))
  );

-- An upsert of your own line is an UPDATE, so the same rule sits in its
-- WITH CHECK; otherwise a line written while you were going could be
-- rewritten after you backed out, or moved onto a plan you never went to.
alter policy capsule_update on public.capsule_entries
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and private.can_add_to_capsule(event_id, (select auth.uid()))
  );
