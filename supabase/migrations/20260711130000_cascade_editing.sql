-- Host controls for editing a live cascade after it's sent: reorder the queued
-- tail, and change a queued invite's response window. Both run security-definer
-- with an explicit is_event_host() check and only ever touch `queued` invites,
-- so already-sent/accepted invites (history) can't be rewritten and no broad
-- UPDATE policy on public.invites is needed.
--
-- Concurrency: these race the 1-minute cascade cron (advanceEventCascade), which
-- flips queued invites to 'sent', and each other. Both functions therefore take
-- a per-event advisory lock (serialising edits so two swaps can't collide on the
-- temporary position slot) and re-check status under a row lock, so an invite
-- that was just sent can never be reordered or re-windowed.

-- Swap a queued invite with its neighbour in the given direction. Uses a
-- temporary out-of-range position to dodge the unique(event_id, position)
-- constraint mid-swap. (position has no non-negative check, so -1 is safe.)
create or replace function public.move_queued_invite(p_invite uuid, p_up boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
  v_pos int;
  v_status text;
  v_other_id uuid;
  v_other_pos int;
begin
  select event_id into v_event from public.invites where id = p_invite;
  if v_event is null then raise exception 'invite not found'; end if;
  if not public.is_event_host(v_event, auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- Serialise all line edits for this event: prevents two concurrent swaps from
  -- both grabbing the temporary -1 slot and colliding on the unique constraint.
  perform pg_advisory_xact_lock(hashtext(v_event::text)::bigint);

  -- Lock the target row and re-read its state; if the cron sent it just now,
  -- we see 'sent' here and refuse.
  select position, status into v_pos, v_status
    from public.invites where id = p_invite for update;
  if v_status is distinct from 'queued' then
    raise exception 'only queued invites can be reordered';
  end if;

  -- The adjacent still-queued invite in the requested direction, locked too.
  if p_up then
    select id, position into v_other_id, v_other_pos from public.invites
      where event_id = v_event and status = 'queued' and position < v_pos
      order by position desc limit 1 for update;
  else
    select id, position into v_other_id, v_other_pos from public.invites
      where event_id = v_event and status = 'queued' and position > v_pos
      order by position asc limit 1 for update;
  end if;
  if v_other_id is null then return; end if; -- already at the end of the queue

  update public.invites set position = -1 where id = p_invite;
  update public.invites set position = v_pos where id = v_other_id;
  update public.invites set position = v_other_pos where id = p_invite;
end $$;

-- Change the response window on a not-yet-sent invite. The status guard lives in
-- the UPDATE's WHERE clause so it's atomic: if the invite was sent in the
-- meantime, zero rows change and we report it rather than editing live history.
create or replace function public.set_invite_window(p_invite uuid, p_minutes int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
  v_updated int;
begin
  if p_minutes is null or p_minutes < 1 then
    raise exception 'window must be a positive number of minutes';
  end if;
  select event_id into v_event from public.invites where id = p_invite;
  if v_event is null then raise exception 'invite not found'; end if;
  if not public.is_event_host(v_event, auth.uid()) then
    raise exception 'not authorized';
  end if;

  update public.invites set window_minutes = p_minutes
    where id = p_invite and status = 'queued';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'only queued invites can be re-windowed';
  end if;
end $$;
