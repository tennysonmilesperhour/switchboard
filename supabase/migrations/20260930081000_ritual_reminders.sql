-- Standing rituals remind both people on the day they are due, and either can
-- skip one (completion plan P8, decision D8).
--
-- A ritual promised "Switchboard nudges you both when it has been about that
-- long, and either of you can skip". Nothing nudged anyone, and there was no
-- skip. "Due" was a guess recomputed on every Home render from
-- `last_planned_at`, which only the creator's plans ever wrote.
--
--   1. `due_on` is the next due date, stored. Accepting a ritual makes the
--      first one due that day; planning one (by either of the pair) makes the
--      next one due a cadence after it; skipping moves the date one cadence
--      ahead (from today, when it is already overdue).
--   2. `ritual_reminders` records one reminder per ritual, per due date, per
--      person. `claim_ritual_reminders` (the cascade cron) writes the record
--      and hands back the people to notify in the same statement, so a
--      reminder is sent at most once however often the sweep runs. It holds a
--      reminder until the person's own due day has started in their zone and
--      they are outside their quiet hours, and never sends one across a block
--      or to either person while one of them is on sabbatical.
--   3. The schedule and the terms are not writable from a session. Before
--      this, `rituals_update` let either participant write any column but the
--      parties: the proposer could accept their own proposal, either person
--      could change the cadence the other agreed to, and anyone could rewrite
--      the due date to make the sweep message the other person every minute.
--      A session may now only move the status along the ritual's life
--      (accepting is the invited partner's alone); the dates move only through
--      the definer functions below. Inserts must be fresh proposals.

-- ————————————————————————— the due date —————————————————————————

alter table public.rituals add column due_on date;

comment on column public.rituals.due_on is
  'The next day this ritual is due. Set on acceptance, moved by planning (a cadence after the plan) or skip_ritual (one cadence ahead). Written only by definer code.';

-- Existing rituals: due a cadence after they were last planned, or today when
-- they never were (which is when Home already showed them as due).
update public.rituals
   set due_on = coalesce(
         (last_planned_at at time zone 'UTC')::date + cadence_days,
         current_date
       )
 where status in ('active', 'paused');

alter table public.rituals
  add constraint rituals_scheduled_check
  check (status not in ('active', 'paused') or due_on is not null);

create index rituals_active_due_idx on public.rituals (due_on) where status = 'active';

-- ————————————————————————— who may change what —————————————————————————

create or replace function private.guard_ritual_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- A session writing through the API. Definer bodies run as their owner and
  -- the server as service_role; those write the schedule on purpose.
  if current_user in ('authenticated', 'anon') then
    if new.activity is distinct from old.activity
       or new.cadence_days is distinct from old.cadence_days
       or new.created_at is distinct from old.created_at then
      raise exception 'a ritual''s activity and cadence are fixed once proposed';
    end if;
    if new.last_planned_at is distinct from old.last_planned_at
       or new.due_on is distinct from old.due_on then
      raise exception 'a ritual''s schedule moves only by planning or skipping it';
    end if;
    if new.status is distinct from old.status then
      if old.status = 'ended' then
        raise exception 'an ended ritual stays ended';
      end if;
      if new.status = 'proposed' or (old.status = 'proposed' and new.status = 'paused') then
        raise exception 'a ritual cannot go from % to %', old.status, new.status;
      end if;
      if old.status = 'proposed' and new.status = 'active'
         and old.partner_id is distinct from auth.uid() then
        raise exception 'only the invited partner can accept a ritual';
      end if;
    end if;
  end if;

  -- Planned (by either person): the next one is due a cadence after that day.
  if new.last_planned_at is not null
     and new.last_planned_at is distinct from old.last_planned_at then
    new.due_on := (new.last_planned_at at time zone 'UTC')::date + new.cadence_days;
  end if;

  -- Accepted: the first one is due today.
  if old.status = 'proposed' and new.status = 'active' then
    new.due_on := current_date;
  end if;

  return new;
end;
$$;

revoke all on function private.guard_ritual_update() from public, anon, authenticated;
grant execute on function private.guard_ritual_update() to service_role;

drop trigger if exists rituals_guard_update on public.rituals;
create trigger rituals_guard_update
  before update on public.rituals
  for each row execute function private.guard_ritual_update();

-- A ritual starts life as a proposal: status, schedule and history are not the
-- proposer's to write. And nobody on sabbatical is asked into one, or asks.
alter policy rituals_insert on public.rituals
  with check (
    creator_id = (select auth.uid())
    and private.are_connected((select auth.uid()), partner_id)
    and status = 'proposed'
    and due_on is null
    and last_planned_at is null
    and not exists (
      select 1
      from public.profiles p
      where p.id in (creator_id, partner_id)
        and coalesce(p.sabbatical, false)
    )
  );

-- ————————————————————————— reminders —————————————————————————

create table public.ritual_reminders (
  ritual_id uuid not null references public.rituals(id) on delete cascade,
  due_on date not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (ritual_id, due_on, user_id)
);

comment on table public.ritual_reminders is
  'One row per ritual, due date and person reminded (or covered by the acceptance itself). Written only by definer code; no session can read or write it.';

create index ritual_reminders_user_id_idx on public.ritual_reminders (user_id);

alter table public.ritual_reminders enable row level security;
revoke all on public.ritual_reminders from anon, authenticated;
grant all on public.ritual_reminders to service_role;

-- Accepting is its own nudge: the proposer hears "it's a ritual" and the
-- partner just said yes, so neither is reminded again about day one.
create or replace function private.ritual_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ritual_reminders (ritual_id, due_on, user_id)
  values (new.id, new.due_on, new.creator_id),
         (new.id, new.due_on, new.partner_id)
  on conflict do nothing;
  return null;
end;
$$;

revoke all on function private.ritual_accepted() from public, anon, authenticated;
grant execute on function private.ritual_accepted() to service_role;

drop trigger if exists rituals_accepted on public.rituals;
create trigger rituals_accepted
  after update of status on public.rituals
  for each row
  when (old.status = 'proposed' and new.status = 'active')
  execute function private.ritual_accepted();

-- The cron's claim: who to remind now, recorded as reminded in the same
-- statement. Service role only.
create or replace function private.claim_ritual_reminders(p_limit integer default 100)
returns table (
  ritual_id uuid,
  due_on date,
  user_id uuid,
  other_id uuid,
  activity text,
  other_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with zones as (
    select z.name from pg_catalog.pg_timezone_names z
  ),
  pairs as (
    select r.id as rid, r.due_on as due, r.activity as what, pair.me, pair.other
      from public.rituals r
      cross join lateral (
        values (r.creator_id, r.partner_id), (r.partner_id, r.creator_id)
      ) as pair(me, other)
     where r.status = 'active'
       -- No zone is more than a day ahead of the database's.
       and r.due_on <= current_date + 1
       and not exists (
         select 1
           from public.ritual_reminders rr
          where rr.ritual_id = r.id
            and rr.due_on = r.due_on
            and rr.user_id = pair.me
       )
  ),
  due as (
    select p.rid, p.due, p.what, p.me, p.other, them.display_name as other_name
      from pairs p
      join public.profiles you on you.id = p.me
      join public.profiles them on them.id = p.other
      left join zones z on z.name = you.timezone
      cross join lateral (
        select now() at time zone coalesce(z.name, 'UTC') as local_now
      ) l
     where not coalesce(you.sabbatical, false)
       and not coalesce(them.sabbatical, false)
       and not private.are_blocked(p.me, p.other)
       -- Their own due day has started where they are.
       and l.local_now::date >= p.due
       -- Outside their quiet hours, where a push would be dropped: the
       -- reminder waits for the hour they are awake instead.
       and not (
         you.quiet_hours_start is not null
         and you.quiet_hours_end is not null
         and case
               when you.quiet_hours_start <= you.quiet_hours_end then
                 extract(hour from l.local_now) >= you.quiet_hours_start
                 and extract(hour from l.local_now) < you.quiet_hours_end
               else
                 extract(hour from l.local_now) >= you.quiet_hours_start
                 or extract(hour from l.local_now) < you.quiet_hours_end
             end
       )
     order by p.due, p.rid
     limit greatest(coalesce(p_limit, 100), 1)
  ),
  claimed as (
    insert into public.ritual_reminders as rr (ritual_id, due_on, user_id)
    select d.rid, d.due, d.me from due d
    on conflict do nothing
    returning rr.ritual_id as rid, rr.due_on as due, rr.user_id as me
  )
  select c.rid, c.due, c.me, d.other, d.what, d.other_name
    from claimed c
    join due d on d.rid = c.rid and d.me = c.me;
end;
$$;

revoke all on function private.claim_ritual_reminders(integer) from public, anon, authenticated;
grant execute on function private.claim_ritual_reminders(integer) to service_role;

create or replace function public.claim_ritual_reminders(p_limit integer default 100)
returns table (
  ritual_id uuid,
  due_on date,
  user_id uuid,
  other_id uuid,
  activity text,
  other_name text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.claim_ritual_reminders(p_limit);
$$;

revoke all on function public.claim_ritual_reminders(integer) from public, anon, authenticated;
grant execute on function public.claim_ritual_reminders(integer) to service_role;

-- ————————————————————————— skipping and planning —————————————————————————

-- Outcomes: skipped | already_moved | not_due | not_active | not_found.
-- `p_due_on` names the occurrence being skipped, so a double tap, or both
-- people skipping at once, moves the date once.
create or replace function private.skip_ritual(p_ritual uuid, p_due_on date)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_ritual public.rituals%rowtype;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  -- A stranger learns nothing: a ritual that is not theirs reads as missing.
  select * into v_ritual
    from public.rituals r
   where r.id = p_ritual
     and v_user in (r.creator_id, r.partner_id)
   for update;
  if not found then
    return 'not_found';
  end if;
  if v_ritual.status <> 'active' then
    return 'not_active';
  end if;
  if v_ritual.due_on is distinct from p_due_on then
    return 'already_moved';
  end if;
  -- Due today wherever the skipper is (no zone is a day ahead of this one).
  if v_ritual.due_on > current_date + 1 then
    return 'not_due';
  end if;

  update public.rituals
     set due_on = greatest(v_ritual.due_on, current_date) + v_ritual.cadence_days
   where id = p_ritual;
  return 'skipped';
end;
$$;

revoke all on function private.skip_ritual(uuid, date) from public, anon;
grant execute on function private.skip_ritual(uuid, date) to authenticated, service_role;

create or replace function public.skip_ritual(p_ritual uuid, p_due_on date)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.skip_ritual(p_ritual, p_due_on);
$$;

revoke all on function public.skip_ritual(uuid, date) from public, anon;
grant execute on function public.skip_ritual(uuid, date) to authenticated, service_role;

-- A plan made from a ritual counts whichever of the pair made it
-- (create_event_atomic only ever counted the proposer's). It must be a plan
-- the caller hosts with the other person on it. Returns the next due date, or
-- null when nothing was recorded.
create or replace function private.note_ritual_planned(p_ritual uuid, p_event uuid)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_due date;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  update public.rituals r
     set last_planned_at = now()
   where r.id = p_ritual
     and v_user in (r.creator_id, r.partner_id)
     and r.status in ('active', 'paused')
     and exists (
       select 1
         from public.events e
         join public.invites i on i.event_id = e.id
        where e.id = p_event
          and e.host_id = v_user
          and i.invitee_id = case when r.creator_id = v_user then r.partner_id else r.creator_id end
     )
  returning r.due_on into v_due;
  return v_due;
end;
$$;

revoke all on function private.note_ritual_planned(uuid, uuid) from public, anon;
grant execute on function private.note_ritual_planned(uuid, uuid) to authenticated, service_role;

create or replace function public.note_ritual_planned(p_ritual uuid, p_event uuid)
returns date
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.note_ritual_planned(p_ritual, p_event);
$$;

revoke all on function public.note_ritual_planned(uuid, uuid) from public, anon;
grant execute on function public.note_ritual_planned(uuid, uuid) to authenticated, service_role;
