-- Parental approval for youth events.
--
-- Hosts can require parental/guardian approval on any plan. When enabled, every
-- RSVP is held in a pending state until a guardian approves it through a
-- token-addressed link emailed to them. The host sees which RSVPs are waiting
-- on approval and which have been cleared.

-- 1. Event-level toggle -------------------------------------------------------

alter table public.events
  add column parental_approval boolean not null default false;

-- 2. Approvals table ----------------------------------------------------------
-- One row per RSVP that needs guardian sign-off. The token is the capability
-- secret for the approval link (/approve/<token>), same pattern as guest_token.

create table public.parental_approvals (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  guardian_email text not null,
  guardian_name text,
  token text not null default encode(gen_random_bytes(24), 'hex') unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index parental_approvals_invite_id on public.parental_approvals(invite_id);
create index parental_approvals_token on public.parental_approvals(token);
create index parental_approvals_event_id on public.parental_approvals(event_id);

-- RLS: host can read approvals for their events; the approval token bearer sees
-- nothing through normal queries (they use the RPC).
alter table public.parental_approvals enable row level security;

create policy parental_approvals_host_read on public.parental_approvals
  for select to authenticated
  using (
    event_id in (
      select id from public.events where host_id = auth.uid()
      union
      select event_id from public.event_cohosts where cohost_id = auth.uid()
    )
  );

-- No direct insert/update/delete for users — managed through RPCs.

-- 3. RPC: resolve a guardian approval -----------------------------------------
-- Called from the /approve/<token> page. No auth required (the token IS the
-- authorization, same model as guest_token for RSVP links).

create or replace function public.resolve_parental_approval(
  p_token text,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_approval parental_approvals%rowtype;
  v_event events%rowtype;
  v_invite invites%rowtype;
begin
  select * into v_approval
    from parental_approvals
    where token = p_token
    for update;

  if v_approval is null then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_approval.status <> 'pending' then
    return jsonb_build_object('outcome', 'already_resolved', 'status', v_approval.status);
  end if;

  select * into v_event from events where id = v_approval.event_id;
  if v_event is null then
    return jsonb_build_object('outcome', 'event_gone');
  end if;

  select * into v_invite from invites where id = v_approval.invite_id;
  if v_invite is null then
    return jsonb_build_object('outcome', 'invite_gone');
  end if;

  if p_approve then
    update parental_approvals
      set status = 'approved', responded_at = now()
      where id = v_approval.id;

    -- If the invite was accepted and just waiting on approval, it's now fully in.
    -- Notify the host.
    return jsonb_build_object(
      'outcome', 'approved',
      'event_title', v_event.title,
      'invite_status', v_invite.status
    );
  else
    update parental_approvals
      set status = 'denied', responded_at = now()
      where id = v_approval.id;

    -- If the person had accepted, withdraw their acceptance.
    if v_invite.status = 'accepted' then
      update invites
        set status = 'cancelled', responded_at = now()
        where id = v_invite.id;
    end if;

    return jsonb_build_object(
      'outcome', 'denied',
      'event_title', v_event.title
    );
  end if;
end $$;

revoke all on function public.resolve_parental_approval(text, boolean) from public, anon;
grant execute on function public.resolve_parental_approval(text, boolean) to anon, authenticated;

-- 4. Update create_event_atomic to persist the new flag -----------------------

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
    show_invite_list, show_accepted, show_expired, reminders_enabled, cover_url,
    theme, wishlist_url, recurrence, recurrence_interval_days, room_id,
    parental_approval
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
    coalesce((p_input->>'remindersEnabled')::boolean, true),
    nullif(p_input->>'coverUrl', ''),
    coalesce(nullif(p_input->>'theme', ''), 'default'),
    nullif(p_input->>'wishlistUrl', ''),
    v_recurrence,
    v_recurrence_days,
    v_room,
    coalesce((p_input->>'parentalApproval')::boolean, false)
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
    insert into public.polls (
      event_id, resolution, suggest_deadline, vote_deadline, phase
    )
    values (
      v_event,
      coalesce(nullif(p_input->>'pollResolution', ''), 'host_pick'),
      nullif(p_input->>'suggestDeadline', '')::timestamptz,
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

revoke all on function public.create_event_atomic(jsonb) from public, anon;
grant execute on function public.create_event_atomic(jsonb) to authenticated;
