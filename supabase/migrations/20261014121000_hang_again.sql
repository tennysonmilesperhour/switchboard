-- "Would you hang out with them again?" after a finished plan.
--
-- After a plan is over, each person who took part is asked, privately and one
-- person at a time, about the people they were there with but are not
-- connected to. A yes from both sides is a match: the same match room every
-- other mutual path opens. A one-sided yes is never seen by anyone, and a no
-- looks exactly like no answer (docs/research/timeleft-onboarding.md, R7).
--
-- The answer is stored as a mutual_intent of kind 'hang_again', so the one
-- matching rule (private.check_mutual_match) and its anonymity invariant cover
-- it. It also writes a private discovery_signal for the friends lane, so the
-- app learns from it the same way it learns from a Discover tap, and a no
-- keeps that person out of the asker's friends browse for thirty days.
--
-- The client may not write these intents directly: being able to say "hang
-- out again" about someone requires having been at the same finished plan,
-- and only answer_hang_again() checks that.

alter table public.mutual_intents drop constraint mutual_intents_kind_check;
alter table public.mutual_intents add constraint mutual_intents_kind_check
  check (kind in ('down_to_connect', 'open_to_reschedule', 'discover_connect', 'hang_again'));

-- ————————————————————————— helpers —————————————————————————

-- Host, co-host, or accepted guest: the same boundary event_reflections uses.
create or replace function private.took_part_in(p_event uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (select 1 from public.events e where e.id = p_event and e.host_id = p_user)
    or exists (
      select 1 from public.event_cohosts c
      where c.event_id = p_event and c.cohost_id = p_user
    )
    or exists (
      select 1 from public.invites i
      where i.event_id = p_event and i.invitee_id = p_user and i.status = 'accepted'
    )
  )
$$;

-- Over: a day past its end, or marked happened/past; never cancelled or draft.
-- The same rule as the event_reflections insert policy.
create or replace function private.plan_is_over(p_event uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.events e
    where e.id = p_event
      and e.status not in ('cancelled', 'draft')
      and (
        e.happened_at is not null
        or e.status = 'past'
        or coalesce(e.ends_at, e.starts_at) <= now() - interval '1 day'
      )
  )
$$;

revoke all on function private.took_part_in(uuid, uuid) from public, anon, authenticated;
revoke all on function private.plan_is_over(uuid) from public, anon, authenticated;
grant execute on function private.took_part_in(uuid, uuid) to service_role;
grant execute on function private.plan_is_over(uuid) to service_role;

-- ————————————————————————— who to ask about —————————————————————————

-- People the caller was at a finished plan with in the last two weeks, who are
-- not already a connection or a match, and whom the caller has not answered
-- about yet. One row per person (their most recent shared plan), newest first.
create function private.hang_again_prompts()
returns table (event_id uuid, event_title text, person_id uuid, person_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as id
  ),
  -- Start from the caller's own plans (indexed lookups), never a scan of
  -- every event, since Home asks on every load.
  mine as (
    select e.id, e.title, coalesce(e.ends_at, e.starts_at, e.happened_at) as at
    from public.events e, me
    where me.id is not null
      and not private.is_suspended(me.id)
      and e.id in (
        select h.id from public.events h where h.host_id = me.id
        union
        select c.event_id from public.event_cohosts c where c.cohost_id = me.id
        union
        select i.event_id from public.invites i
        where i.invitee_id = me.id and i.status = 'accepted'
      )
      and coalesce(e.ends_at, e.starts_at, e.happened_at) >= now() - interval '14 days'
      and private.plan_is_over(e.id)
  ),
  people as (
    select m.id as event_id, m.title, m.at, x.user_id
    from mine m
    cross join lateral (
      select e.host_id as user_id from public.events e where e.id = m.id
      union
      select c.cohost_id from public.event_cohosts c where c.event_id = m.id
      union
      select i.invitee_id from public.invites i
      where i.event_id = m.id and i.status = 'accepted' and i.invitee_id is not null
    ) x
  ),
  latest as (
    select distinct on (p.user_id) p.event_id, p.title, p.at, p.user_id
    from people p, me
    where p.user_id <> me.id
    order by p.user_id, p.at desc
  )
  select l.event_id, l.title, l.user_id, prof.display_name
  from latest l
  cross join me
  join public.profiles prof on prof.id = l.user_id
  where not private.are_connected(me.id, l.user_id)
    and not private.are_blocked(me.id, l.user_id)
    and not private.is_suspended(l.user_id)
    and not coalesce(prof.sabbatical, false)
    and not exists (
      select 1 from public.mutual_intents mi
      where mi.author_id = me.id and mi.target_id = l.user_id and mi.kind = 'hang_again'
    )
    and not exists (
      select 1 from public.matches mt
      where mt.user_a = least(me.id, l.user_id) and mt.user_b = greatest(me.id, l.user_id)
    )
  order by l.at desc, prof.display_name
  limit 6
$$;

create function public.hang_again_prompts()
returns table (event_id uuid, event_title text, person_id uuid, person_name text)
language sql
set search_path = ''
as $$select * from private.hang_again_prompts()$$;

-- ————————————————————————— answering —————————————————————————

-- Returns 'matched' when this answer completes a mutual yes, otherwise 'saved'.
-- A refusal is the same for every reason (not there, not over, blocked), so
-- the caller cannot use it to learn anything about the other person.
create function private.answer_hang_again(p_event uuid, p_target uuid, p_yes boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_yes boolean := coalesce(p_yes, false);
  v_status text;
begin
  if v_me is null
     or p_target is null
     or p_target = v_me
     or not private.plan_is_over(p_event)
     or not private.took_part_in(p_event, v_me)
     or not private.took_part_in(p_event, p_target)
     or private.are_blocked(v_me, p_target)
     or private.is_suspended(v_me) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- A suspended person never matches. Their side is recorded as a no without
  -- telling the asker why, exactly as if they had not answered.
  if private.is_suspended(p_target) then
    v_yes := false;
  end if;

  insert into public.mutual_intents (author_id, target_id, activity, kind, event_id, status)
  values (
    v_me, p_target, 'Hang out again', 'hang_again', p_event,
    case when v_yes then 'active' else 'withdrawn' end
  )
  on conflict (author_id, target_id, activity, kind) do update
    set status = excluded.status, event_id = excluded.event_id
    where public.mutual_intents.status <> 'matched';

  insert into public.discovery_signals (user_id, target_id, self, kind)
  values (v_me, p_target, 'friends', case when coalesce(p_yes, false) then 'accepted' else 'passed' end);

  select mi.status into v_status
  from public.mutual_intents mi
  where mi.author_id = v_me
    and mi.target_id = p_target
    and mi.activity = 'Hang out again'
    and mi.kind = 'hang_again';

  return case when v_status = 'matched' then 'matched' else 'saved' end;
end
$$;

create function public.answer_hang_again(p_event uuid, p_target uuid, p_yes boolean)
returns text
language sql
set search_path = ''
as $$select private.answer_hang_again(p_event, p_target, p_yes)$$;

revoke all on function private.hang_again_prompts() from public, anon;
revoke all on function public.hang_again_prompts() from public, anon;
revoke all on function private.answer_hang_again(uuid, uuid, boolean) from public, anon;
revoke all on function public.answer_hang_again(uuid, uuid, boolean) from public, anon;
grant execute on function private.hang_again_prompts() to authenticated, service_role;
grant execute on function public.hang_again_prompts() to authenticated, service_role;
grant execute on function private.answer_hang_again(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.answer_hang_again(uuid, uuid, boolean) to authenticated, service_role;

-- ————————————————————————— client writes —————————————————————————

-- Every rule from 20261008130000_verified_facts_selves_mood.sql, plus: the
-- client never writes a hang_again intent itself.
alter policy mutual_intents_own on public.mutual_intents
  with check (
    author_id = (select auth.uid())
    and kind <> 'hang_again'
    and (target_id is null or not private.are_blocked((select auth.uid()), target_id))
    and (
      kind <> 'discover_connect'
      or status <> 'active'
      or exists (
        select 1
        from public.profiles me
        where me.id = (select auth.uid())
          and me.discoverable
          and not coalesce(me.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not exists (
        select 1
        from public.profiles p
        where p.id in ((select auth.uid()), target_id)
          and coalesce(p.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not (
        private.is_suspended((select auth.uid()))
        or (target_id is not null and private.is_suspended(target_id))
      )
    )
    and (
      kind <> 'discover_connect'
      or status <> 'active'
      or private.discovery_lane_active((select auth.uid()))
    )
  );

-- ————————————————————————— matching —————————————————————————

-- Exactly as 20261008130000_verified_facts_selves_mood.sql left it, with
-- hang_again matching on the pair rather than the plan: two people who said
-- yes about each other after different plans they were both at still match.
create or replace function private.check_mutual_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mirror public.mutual_intents%rowtype;
  v_room uuid;
begin
  select * into v_mirror from public.mutual_intents
    where author_id = new.target_id
      and target_id = new.author_id
      and activity = new.activity
      and kind = new.kind
      and status = 'active'
      and (
        kind in ('down_to_connect', 'discover_connect', 'hang_again')
        or event_id is not distinct from new.event_id
      )
    limit 1
    for update;

  if found
     and (
       new.kind <> 'discover_connect'
       or auth.uid() is null
       or exists (
         select 1 from private.discovery_pair(
           new.author_id, new.target_id,
           private.discovery_lane_of_activity(new.activity)
         )
       )
     ) then
    insert into public.rooms (kind, title, created_by)
      values ('match', new.activity, new.author_id)
      returning id into v_room;
    insert into public.room_members (room_id, member_id)
      values (v_room, new.author_id), (v_room, new.target_id);
    insert into public.matches (user_a, user_b, activity, kind, event_id, room_id)
      values (least(new.author_id, new.target_id), greatest(new.author_id, new.target_id),
              new.activity, new.kind, new.event_id, v_room);
    update public.mutual_intents set status = 'matched' where id in (new.id, v_mirror.id);
  end if;
  return new;
end $$;
revoke all on function private.check_mutual_match() from public, anon, authenticated;
grant execute on function private.check_mutual_match() to service_role;
