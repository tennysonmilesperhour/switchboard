-- Multiple-choice RSVP questions.
--
-- Event intake questions were free-text only. Add an optional 'choice' kind with
-- a host-defined option list so guests pick from a fixed set instead of typing.
-- The options live as a text[] column on event_questions: they are host-defined
-- and follow the exact same event-visibility RLS as the prompt, so no new table
-- (or new policies) is needed. The stored answer stays the chosen option's text,
-- so invite_answers, the guest RSVP flow, and the host answer view are unchanged.

alter table public.event_questions
  add column kind text not null default 'text'
    check (kind in ('text', 'choice'));
alter table public.event_questions
  add column options text[] not null default '{}';

-- A choice question carries a small, bounded set of options; a text question
-- carries none. Existing rows default to text/{} and already satisfy this.
alter table public.event_questions
  add constraint event_questions_options_ck check (
    (kind = 'text' and cardinality(options) = 0)
    or (kind = 'choice' and cardinality(options) between 2 and 10)
  );

-- Refresh the atomic publish path so it persists question kind + options. Only
-- the SECURITY DEFINER implementation (moved to `private` in
-- 20260717192758) changes; the public SECURITY INVOKER wrapper still delegates
-- here, so its name, signature, and grants are untouched.
create or replace function private.create_event_atomic(p_input jsonb)
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
    theme, wishlist_url, recurrence, recurrence_interval_days, room_id
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
    v_room
  );

  -- Questions. Sanitize options (trim, drop blanks, cap length, keep order) and
  -- only honor 'choice' when at least two real options survive — otherwise the
  -- question degrades to free text. This keeps every inserted row inside
  -- event_questions_options_ck so a half-filled choice can't abort the publish.
  insert into public.event_questions (event_id, prompt, required, position, kind, options)
  select
    v_event,
    left(btrim(q.value->>'prompt'), 240),
    coalesce((q.value->>'required')::boolean, false),
    q.ordinality - 1,
    case
      when q.value->>'kind' = 'choice' and cardinality(opts.arr) >= 2
        then 'choice'
      else 'text'
    end,
    case
      when q.value->>'kind' = 'choice' and cardinality(opts.arr) >= 2
        then opts.arr[1:10]
      else '{}'::text[]
    end
  from jsonb_array_elements(coalesce(p_input->'questions', '[]'::jsonb))
    with ordinality as q(value, ordinality)
  cross join lateral (
    select coalesce(
      array_agg(left(btrim(o.opt), 120) order by o.ord),
      '{}'::text[]
    ) as arr
    from jsonb_array_elements_text(
      case when jsonb_typeof(q.value->'options') = 'array'
        then q.value->'options'
        else '[]'::jsonb
      end
    ) with ordinality as o(opt, ord)
    where char_length(btrim(o.opt)) > 0
  ) opts
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

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260717210000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
