-- Event timezone.
--
-- `starts_at` is a `timestamptz` — a single UTC instant. That's the right
-- storage type, but on its own it can't be rendered back into the wall-clock
-- time the host meant. Client renders happen to work (the browser localizes to
-- the viewer), but every *server* render (the OG unfurl image, the guest RSVP /
-- join pages, and the SSR event/plans/home pages) has no viewer zone and falls
-- back to the server's — UTC on Vercel. So a plan a host sets for "tomorrow at
-- 6pm" in US Central was unfurling in link previews as "12:00 AM" the next day
-- (18:00 CDT == 00:00Z). Storing the zone the host created the plan in lets
-- those server renders show the intended local time.
--
-- The zone is the host's IANA zone captured in the browser at create/edit time
-- (`Intl.DateTimeFormat().resolvedOptions().timeZone`), which is exactly the
-- zone `starts_at` was computed in — so formatting `starts_at` in `time_zone`
-- reproduces the wall clock the host picked. Nullable: plans created before this
-- migration (and any client that can't resolve a zone) keep the prior behavior.
alter table public.events
  add column if not exists time_zone text;

-- Redefine create_event_atomic to persist the zone. Body is otherwise identical
-- to the 20260710132000_recurring_events definition; create or replace preserves
-- the existing execute grants.
create or replace function public.create_event_atomic(p_input jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_room uuid := gen_random_uuid();
  v_event uuid := gen_random_uuid();
  v_title text := btrim(p_input->>'title');
  v_invite_mode text := p_input->>'inviteMode';
  v_enable_poll boolean := coalesce((p_input->>'enablePoll')::boolean, false);
  v_recurrence text := coalesce(nullif(p_input->>'recurrence', ''), 'none');
  v_recurrence_days int := nullif(p_input->>'recurrenceIntervalDays', '')::int;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if v_title is null or char_length(v_title) = 0 then raise exception 'title required'; end if;
  if v_invite_mode not in ('individual', 'group', 'all_at_once') then raise exception 'invalid invite mode'; end if;
  if jsonb_array_length(coalesce(p_input->'invitees', '[]'::jsonb)) = 0 then
    raise exception 'invitee required';
  end if;

  if v_recurrence not in ('none', 'daily', 'weekly', 'biweekly', 'monthly', 'custom') then
    v_recurrence := 'none';
  end if;
  -- Keep the (recurrence, interval) pair consistent with the table check so a
  -- bad client payload can't abort the whole transaction on the constraint.
  if v_recurrence = 'custom' then
    v_recurrence_days := least(greatest(coalesce(v_recurrence_days, 0), 1), 365);
  else
    v_recurrence_days := null;
  end if;

  insert into public.rooms (id, kind, title, created_by)
  values (v_room, 'event', left(v_title, 120), v_user);
  insert into public.room_members (room_id, member_id) values (v_room, v_user);

  insert into public.events (
    id, host_id, title, description, location_name, location_address,
    starts_at, ends_at, time_zone, capacity, invite_mode, open_table, status,
    show_invite_list, show_accepted, show_expired, cover_url, theme,
    wishlist_url, recurrence, recurrence_interval_days, room_id
  ) values (
    v_event,
    v_user,
    left(v_title, 120),
    nullif(p_input->>'description', ''),
    nullif(p_input->>'locationName', ''),
    nullif(p_input->>'locationAddress', ''),
    nullif(p_input->>'startsAt', '')::timestamptz,
    nullif(p_input->>'endsAt', '')::timestamptz,
    left(nullif(p_input->>'timeZone', ''), 64),
    nullif(p_input->>'capacity', '')::int,
    v_invite_mode,
    coalesce((p_input->>'openTable')::boolean, false)
      and nullif(p_input->>'capacity', '') is not null,
    case when v_enable_poll then 'deciding' else 'inviting' end,
    coalesce((p_input->>'showInviteList')::boolean, false),
    coalesce((p_input->>'showAccepted')::boolean, false),
    coalesce((p_input->>'showExpired')::boolean, false),
    nullif(p_input->>'coverUrl', ''),
    coalesce(nullif(p_input->>'theme', ''), 'default'),
    nullif(p_input->>'wishlistUrl', ''),
    v_recurrence,
    v_recurrence_days,
    v_room
  );

  insert into public.event_questions (event_id, prompt, required, position)
  select
    v_event,
    left(btrim(q.value->>'prompt'), 240),
    coalesce((q.value->>'required')::boolean, false),
    q.ordinality - 1
  from jsonb_array_elements(coalesce(p_input->'questions', '[]'::jsonb))
    with ordinality as q(value, ordinality)
  where char_length(btrim(q.value->>'prompt')) > 0;

  insert into public.invites (
    event_id, invitee_id, guest_name, guest_contact, position,
    group_stage, window_minutes, status, sent_at
  )
  select
    v_event,
    nullif(i.value->>'profileId', '')::uuid,
    nullif(left(btrim(i.value->>'guestName'), 120), ''),
    nullif(left(btrim(i.value->>'guestContact'), 320), ''),
    i.ordinality - 1,
    case
      when v_invite_mode = 'individual' then i.ordinality - 1
      else coalesce((i.value->>'groupStage')::int, 0)
    end,
    greatest(coalesce((i.value->>'windowMinutes')::int, 1440), 1),
    case
      when not v_enable_poll and (
        (v_invite_mode = 'individual' and i.ordinality = 1)
        or (v_invite_mode <> 'individual' and coalesce((i.value->>'groupStage')::int, 0) = 0)
      ) then 'sent'
      else 'queued'
    end,
    case
      when not v_enable_poll and (
        (v_invite_mode = 'individual' and i.ordinality = 1)
        or (v_invite_mode <> 'individual' and coalesce((i.value->>'groupStage')::int, 0) = 0)
      ) then now()
      else null
    end
  from jsonb_array_elements(p_input->'invitees')
    with ordinality as i(value, ordinality);

  if v_enable_poll then
    insert into public.polls (event_id, resolution, vote_deadline, phase)
    values (
      v_event,
      coalesce(nullif(p_input->>'pollResolution', ''), 'host_pick'),
      nullif(p_input->>'voteDeadline', '')::timestamptz,
      'suggesting'
    );
  end if;

  if nullif(p_input->>'ritualId', '') is not null then
    update public.rituals
      set last_planned_at = now()
      where id = (p_input->>'ritualId')::uuid
        and creator_id = v_user;
  end if;

  return v_event;
end $$;
