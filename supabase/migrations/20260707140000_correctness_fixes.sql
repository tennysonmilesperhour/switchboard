-- Correctness fixes (audit findings H1, H2).
--
-- H1  AWI poll unreachable during the `deciding` phase. When an event is created
--     with a poll it sits in status `deciding` with all invites `queued`, but
--     can_view_event() excluded queued invitees, so only the host could see or
--     vote on the poll. Broaden the function so an invitee can view an event
--     while it is in the `deciding` phase (the group is voting before invites go
--     out), without weakening the poll_votes author-only-read invariant.
--
--     Why this over "send a stage-0 wave first": sending invites during the
--     decide phase would leak the plan as a firm invitation and start response
--     windows before the group has agreed on what/when. Broadening visibility
--     keeps the cascade unstarted until the poll resolves.
--
-- H2  Non-atomic cascade apply. advanceEventCascade read a snapshot, computed
--     transitions in TS, then wrote them one-by-one with no lock or precondition,
--     so a concurrent accept/sweep could send invites off a stale snapshot or
--     leave a half-applied set on crash. Apply the engine's transitions inside a
--     single locked function that guards each by its expected predecessor status
--     and re-checks capacity under the same event-row lock the accept path holds.
--     The pure engine (src/lib/engine/cascade.ts) stays the single source of
--     truth; only the persistence step moves into the database.

-- ————————————————————————— H1 —————————————————————————
create or replace function public.can_view_event(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e where e.id = p_event and e.host_id = p_user
  ) or exists (
    -- An invitee sees the event once their invite is live (never while merely
    -- queued) OR while the event is in the `deciding` phase, when the whole
    -- invited group is meant to vote before any invite is sent.
    select 1 from public.invites i
    join public.events e on e.id = i.event_id
    where i.event_id = p_event
      and i.invitee_id = p_user
      and (i.status <> 'queued' or e.status = 'deciding')
  );
$$;

-- ————————————————————————— H2 —————————————————————————
-- Apply a batch of cascade transitions computed by the TS engine, atomically.
-- p_updates is the engine's CascadeUpdate[] as JSON: [{id, status, sentAt?}, …].
-- Returns the invite ids actually transitioned to 'sent' so the caller notifies
-- exactly those (a 'sent' is skipped if capacity filled under the lock).
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
          where id = (upd->>'id')::uuid and status = 'queued';
        get diagnostics v_updated = row_count;
        if v_updated > 0 then
          sent_id := (upd->>'id')::uuid;
          return next;
        end if;
      end if;
    elsif upd->>'status' = 'expired' then
      update public.invites set status = 'expired'
        where id = (upd->>'id')::uuid and status = 'sent';
    elsif upd->>'status' = 'cancelled' then
      update public.invites set status = 'cancelled'
        where id = (upd->>'id')::uuid and status in ('queued', 'sent');
    end if;
  end loop;
  return;
end $$;
