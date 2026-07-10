-- Cascade hygiene: close several holes where invites got stuck in states that
-- were invisible, un-actionable, or applied against the wrong event.
--
-- SB-04  RSVP RPCs only checked invite.status = 'sent', never the event's
--        status, so a still-live token could "accept" a cancelled/confirmed
--        event. Guard both accept/decline paths on events.status = 'inviting'.
--        (The app-layer cancel/confirm now also retires outstanding invites, so
--        this is the belt to that suspenders — it also closes the tiny race
--        between the status flip and the invite retirement.)
-- SB-16  apply_cascade_updates locked the event row for p_event but its per-row
--        UPDATEs keyed only on invite id, so a stray id from another event
--        would be mutated under this event's lock. Scope every UPDATE to
--        event_id = p_event.
-- SB-14  When an event fills, open-table join requests (status 'requested')
--        were left pending forever. Let the "full" sweep cancel them too, so
--        add 'requested' to the statuses apply_cascade_updates will cancel.

-- ─────────────────────────── respond_to_invite ───────────────────────────
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted int;
  v_cap int;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.invitee_id is distinct from auth.uid() then
    raise exception 'not your invite';
  end if;
  if v_invite.status <> 'sent' then
    return v_invite.status; -- window already closed or already answered
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status; -- event is no longer taking RSVPs (confirmed/cancelled)
  end if;

  if not p_accept then
    update public.invites
      set status = 'declined', responded_at = now(), decline_note = p_note
      where id = p_invite;
    return 'declined';
  end if;

  select count(*) into v_accepted from public.invites
    where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(v_event.capacity, case when v_event.invite_mode = 'individual' then 1 else null end);

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites set status = 'waitlisted', responded_at = now() where id = p_invite;
    return 'waitlisted';
  end if;

  update public.invites set status = 'accepted', responded_at = now() where id = p_invite;
  return 'accepted';
end $$;

-- ──────────────────────── respond_to_guest_invite ────────────────────────
-- Event row is now loaded before the decline branch so the status guard covers
-- both accept and decline (matching respond_to_invite).
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

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status; -- event is no longer taking RSVPs (confirmed/cancelled)
  end if;

  if not p_accept then
    update public.invites set status = 'declined', responded_at = now() where id = v_invite.id;
    return 'declined';
  end if;

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

-- ──────────────────────── apply_cascade_updates ─────────────────────────
create or replace function public.apply_cascade_updates(p_event uuid, p_updates jsonb)
returns table (sent_id uuid) language plpgsql security definer set search_path = public as $$
declare
  v_event public.events%rowtype;
  v_accepted int;
  v_cap int;
  v_updated int;
  upd jsonb;
begin
  -- Serialize against respond_to_invite (which also locks the event row) and
  -- against concurrent cascade applies.
  select * into v_event from public.events where id = p_event for update;
  if not found or v_event.status <> 'inviting' then
    return;
  end if;

  select count(*) into v_accepted from public.invites
    where event_id = p_event and status = 'accepted';
  v_cap := coalesce(v_event.capacity, case when v_event.invite_mode = 'individual' then 1 else null end);

  for upd in select * from jsonb_array_elements(p_updates)
  loop
    if upd->>'status' = 'sent' then
      -- Only send if a spot still remains under the lock. This closes the
      -- stale-snapshot race where the engine decided to send off a pre-accept
      -- read and the event has since filled.
      if v_cap is null or v_accepted < v_cap then
        update public.invites
          set status = 'sent',
              sent_at = coalesce((upd->>'sentAt')::timestamptz, now())
          where id = (upd->>'id')::uuid and event_id = p_event and status = 'queued';
        get diagnostics v_updated = row_count;
        if v_updated > 0 then
          sent_id := (upd->>'id')::uuid;
          return next;
        end if;
      end if;
    elsif upd->>'status' = 'expired' then
      update public.invites set status = 'expired'
        where id = (upd->>'id')::uuid and event_id = p_event and status = 'sent';
    elsif upd->>'status' = 'cancelled' then
      -- 'requested' (open-table join requests) are retired here too once the
      -- event fills — they can never be approved, so don't leave them pending.
      update public.invites set status = 'cancelled'
        where id = (upd->>'id')::uuid and event_id = p_event
          and status in ('queued', 'sent', 'requested');
    end if;
  end loop;
  return;
end $$;
