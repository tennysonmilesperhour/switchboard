-- SB-02  Publishing a plan that fulfills a standing ritual always failed.
--
-- create_event_atomic's "mark the ritual planned" step referenced
-- rituals.proposer_id, but that column does not exist on public.rituals — the
-- column is creator_id (innovations.sql:117); proposer_id only exists on the
-- matchmaker-proposals table. So any createEvent carrying a non-null ritualId
-- raised `column "proposer_id" does not exist` inside the transaction, rolling
-- back the entire publish and surfacing the generic "Nothing was saved" error.
--
-- Redefine the function with the correct column. Body is otherwise identical to
-- the 20260708120000_launch_hardening definition; create or replace preserves
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
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if v_title is null or char_length(v_title) = 0 then raise exception 'title required'; end if;
  if v_invite_mode not in ('individual', 'group', 'all_at_once') then raise exception 'invalid invite mode'; end if;
  if jsonb_array_length(coalesce(p_input->'invitees', '[]'::jsonb)) = 0 then
    raise exception 'invitee required';
  end if;

  insert into public.rooms (id, kind, title, created_by)
  values (v_room, 'event', left(v_title, 120), v_user);
  insert into public.room_members (room_id, member_id) values (v_room, v_user);

  insert into public.events (
    id, host_id, title, description, location_name, location_address,
    starts_at, ends_at, capacity, invite_mode, open_table, status,
    show_invite_list, show_accepted, show_expired, cover_url, theme,
    wishlist_url, room_id
  ) values (
    v_event,
    v_user,
    left(v_title, 120),
    nullif(p_input->>'description', ''),
    nullif(p_input->>'locationName', ''),
    nullif(p_input->>'locationAddress', ''),
    nullif(p_input->>'startsAt', '')::timestamptz,
    nullif(p_input->>'endsAt', '')::timestamptz,
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
