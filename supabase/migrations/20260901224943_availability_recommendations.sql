-- Availability recommendations need to know two things the slot counts cannot
-- say: how many people were asked, and how many actually answered. In
-- particular, "none of these work" is an answer even though it produces no
-- event_availability rows. Keep that fact in a separate marker table so the
-- private per-slot rows remain exactly as private as before.

create table public.event_availability_responses (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- The primary key starts with event_id. Profile deletion cascades by user_id,
-- so it needs its own index rather than scanning every plan's response marker.
create index event_availability_responses_user_idx
  on public.event_availability_responses (user_id);

alter table public.event_availability_responses enable row level security;

create policy event_availability_responses_own
  on public.event_availability_responses
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

grant select on public.event_availability_responses to authenticated;

-- Existing marks prove that their owner answered. This gives recommendations a
-- truthful starting point without claiming anything about people with no rows.
insert into public.event_availability_responses (event_id, user_id, submitted_at)
select event_id, user_id, min(created_at)
from public.event_availability
group by event_id, user_id
on conflict (event_id, user_id) do nothing;

-- Replace one person's answer atomically. The old action deleted and inserted
-- in separate requests, so a failed insert could erase the answer while the UI
-- reported a save failure. It also could not record an intentionally empty
-- answer. This is the only write door for both tables.
create or replace function public.replace_event_availability(
  p_event uuid,
  p_slots timestamptz[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_window_start timestamptz := timezone(
    'UTC',
    date_trunc('day', timezone('UTC', statement_timestamp()))
  );
begin
  if v_user is null or not public.can_view_event(p_event, v_user) then
    raise exception using
      errcode = '42501',
      message = 'not allowed to answer availability for this plan';
  end if;

  -- Match src/lib/availability.ts: four exact UTC band starts across the next
  -- seven UTC calendar days. The server action checks too, but this function is
  -- an authenticated RPC and therefore must defend itself from direct callers.
  if exists (
    select 1
    from unnest(coalesce(p_slots, '{}'::timestamptz[])) as proposed(slot)
    where proposed.slot is null
       or proposed.slot < v_window_start
       or proposed.slot >= v_window_start + interval '7 days'
       or extract(hour from proposed.slot at time zone 'UTC') not in (8, 12, 17, 22)
       or extract(minute from proposed.slot at time zone 'UTC') <> 0
       or extract(second from proposed.slot at time zone 'UTC') <> 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'slot is outside the offered availability grid';
  end if;

  delete from public.event_availability
  where event_id = p_event and user_id = v_user;

  insert into public.event_availability (event_id, user_id, slot)
  select p_event, v_user, proposed.slot
  from (
    select distinct unnest(coalesce(p_slots, '{}'::timestamptz[])) as slot
  ) proposed;

  insert into public.event_availability_responses (event_id, user_id, submitted_at)
  values (p_event, v_user, statement_timestamp())
  on conflict (event_id, user_id)
  do update set submitted_at = excluded.submitted_at;
end;
$$;

revoke all on function public.replace_event_availability(uuid, timestamptz[])
  from public, anon;
grant execute on function public.replace_event_availability(uuid, timestamptz[])
  to authenticated;

-- Once the RPC exists, direct writes would be a way around its grid validation
-- and atomic response marker. Keep owner SELECT under RLS, but make mutations go
-- through the single checked function above.
revoke insert, update, delete on public.event_availability
  from public, anon, authenticated;
revoke insert, update, delete on public.event_availability_responses
  from public, anon, authenticated;

-- Group-level participation only: no user id or response roster leaves this
-- function. A caller outside the plan gets 0/0, which reveals neither whether
-- the event exists nor how many people are on it.
create or replace function public.event_availability_summary(p_event uuid)
returns table (responders integer, eligible_people integer)
language sql
stable
security definer
set search_path = ''
as $$
  with caller as (
    select coalesce(
      (select auth.uid()) is not null
      and public.can_view_event(p_event, (select auth.uid())),
      false
    ) as allowed
  ),
  eligible(user_id) as (
    select e.host_id
    from public.events e, caller
    where e.id = p_event and caller.allowed

    union

    select i.invitee_id
    from public.invites i
    join public.events e on e.id = i.event_id
    cross join caller
    where i.event_id = p_event
      and i.invitee_id is not null
      and (i.status <> 'queued' or e.status = 'deciding')
      and caller.allowed
  )
  select count(r.user_id)::integer as responders,
         count(eligible.user_id)::integer as eligible_people
  from eligible
  left join public.event_availability_responses r
    on r.event_id = p_event and r.user_id = eligible.user_id;
$$;

revoke all on function public.event_availability_summary(uuid)
  from public, anon;
grant execute on function public.event_availability_summary(uuid)
  to authenticated;

comment on table public.event_availability_responses is
  'One aggregate-only marker that a person submitted availability, including an empty answer. Owners can read their own marker; the group sees counts only through event_availability_summary().';
