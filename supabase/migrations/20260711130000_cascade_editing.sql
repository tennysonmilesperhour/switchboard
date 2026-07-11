-- Host controls for editing a live cascade after it's sent: reorder the queued
-- tail, and change a queued invite's response window. Both run security-definer
-- with an explicit is_event_host() check and only ever touch `queued` invites,
-- so already-sent/accepted invites (history) can't be rewritten and no broad
-- UPDATE policy on public.invites is needed.

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
  select event_id, position, status into v_event, v_pos, v_status
    from public.invites where id = p_invite;
  if v_event is null then raise exception 'invite not found'; end if;
  if not public.is_event_host(v_event, auth.uid()) then
    raise exception 'not authorized';
  end if;
  if v_status <> 'queued' then
    raise exception 'only queued invites can be reordered';
  end if;

  if p_up then
    select id, position into v_other_id, v_other_pos from public.invites
      where event_id = v_event and status = 'queued' and position < v_pos
      order by position desc limit 1;
  else
    select id, position into v_other_id, v_other_pos from public.invites
      where event_id = v_event and status = 'queued' and position > v_pos
      order by position asc limit 1;
  end if;
  if v_other_id is null then return; end if; -- already at the end of the queue

  update public.invites set position = -1 where id = p_invite;
  update public.invites set position = v_pos where id = v_other_id;
  update public.invites set position = v_other_pos where id = p_invite;
end $$;

-- Change the response window on a not-yet-sent invite.
create or replace function public.set_invite_window(p_invite uuid, p_minutes int)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_event uuid;
  v_status text;
begin
  if p_minutes is null or p_minutes < 1 then
    raise exception 'window must be a positive number of minutes';
  end if;
  select event_id, status into v_event, v_status
    from public.invites where id = p_invite;
  if v_event is null then raise exception 'invite not found'; end if;
  if not public.is_event_host(v_event, auth.uid()) then
    raise exception 'not authorized';
  end if;
  if v_status <> 'queued' then
    raise exception 'only queued invites can be re-windowed';
  end if;
  update public.invites set window_minutes = p_minutes where id = p_invite;
end $$;
