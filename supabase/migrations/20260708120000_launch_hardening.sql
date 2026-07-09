-- Launch hardening: atomic plan publication, durable rate limits, and explicit
-- execution privileges for security-definer functions.

create table if not exists public.rate_limits (
  key_hash text primary key,
  attempts int not null default 0,
  window_started_at timestamptz not null default now()
);
alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_key_hash text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempts int;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    return false;
  end if;

  insert into public.rate_limits (key_hash, attempts, window_started_at)
  values (p_key_hash, 1, now())
  on conflict (key_hash) do update
    set attempts = case
      when rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else rate_limits.attempts + 1
    end,
    window_started_at = case
      when rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else rate_limits.window_started_at
    end
  returning attempts into v_attempts;

  return v_attempts <= p_limit;
end $$;

revoke all on function public.consume_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, int, int) to service_role;

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
        and proposer_id = v_user;
  end if;

  return v_event;
end $$;

revoke all on function public.create_event_atomic(jsonb) from public, anon;
grant execute on function public.create_event_atomic(jsonb) to authenticated;

-- Internal cascade persistence must only be callable by trusted server code.
revoke all on function public.apply_cascade_updates(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.apply_cascade_updates(uuid, jsonb) to service_role;

-- Publicly reachable RPCs receive explicit, least-privilege grants.
revoke all on function public.respond_to_guest_invite(uuid, boolean) from public, authenticated;
grant execute on function public.respond_to_guest_invite(uuid, boolean) to anon, service_role;
revoke all on function public.reschedule_cancel_event(uuid) from public, anon;
grant execute on function public.reschedule_cancel_event(uuid) to authenticated;

create table public.profile_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.profile_blocks enable row level security;
create policy profile_blocks_own on public.profile_blocks for all to authenticated
  using (blocker_id = auth.uid())
  with check (blocker_id = auth.uid());

create table public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
alter table public.user_reports enable row level security;
create policy user_reports_insert on public.user_reports for insert to authenticated
  with check (reporter_id = auth.uid());
create policy user_reports_own_select on public.user_reports for select to authenticated
  using (reporter_id = auth.uid());

create or replace function public.are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profile_blocks
    where (blocker_id = p_user_a and blocked_id = p_user_b)
       or (blocker_id = p_user_b and blocked_id = p_user_a)
  );
$$;
revoke all on function public.are_blocked(uuid, uuid) from public, anon;
grant execute on function public.are_blocked(uuid, uuid) to authenticated;

drop policy if exists connections_insert on public.connections;
create policy connections_insert on public.connections for insert to authenticated
  with check (
    requester_id = auth.uid()
    and not public.are_blocked(requester_id, addressee_id)
  );
