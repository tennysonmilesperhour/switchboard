-- Availability in the plan's own zone (completion plan G19).
--
-- ————————————————————————— what was wrong —————————————————————————
--
-- A grid slot is a label: its UTC calendar date is the plan's date and its UTC
-- hour is the band's start (8, 12, 17, 22) — "2026-10-02T17:00Z" means "Friday
-- evening", and every reader decodes it that way (src/lib/availability.ts,
-- src/components/polls/option-label.ts). Two things read it as a real instant
-- instead:
--
--   * a connected calendar's busy blocks were matched against the label as if
--     it were 17:00 in Greenwich, so "Fill from my calendar" marked the wrong
--     evenings for anyone away from UTC; and
--   * the week on offer started on Greenwich's today, so a plan in New York
--     opened at 9pm stopped offering that evening, and one in Auckland offered
--     yesterday.
--
-- ————————————————————————— what changes, and what does not —————————————
--
-- Stored `event_availability` rows are untouched. They were always labels, the
-- label encoding is kept, and so every existing answer still lands in the cell
-- it was given for. What moves into the plan's zone is the two things above:
--
--   1. `replace_event_availability` offers the plan's seven days (its
--      `time_zone`, else UTC — the same resolution as the app's
--      `planGridZone`), not Greenwich's. Same label rule otherwise.
--   2. `calendar_busy` stores real quarter-hours rather than UTC bands. Busy
--      time belongs to a person, not a plan, and a band only means something
--      in one zone; quarter-hours are the coarsest step every zone's band edges
--      fall on (+5:30, +5:45). Each plan turns them into its own bands.
--
-- The body moves to `private` behind a thin invoker wrapper, the convention for
-- authenticated-callable definer functions (docs/SECURITY.md). The public
-- signature, and so the generated types, are unchanged.

create or replace function private.replace_event_availability(
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
  v_zone text;
  v_today date;
begin
  if v_user is null or not public.can_view_event(p_event, v_user) then
    raise exception using
      errcode = '42501',
      message = 'not allowed to answer availability for this plan';
  end if;

  select coalesce(nullif(btrim(e.time_zone), ''), 'UTC')
    into v_zone
    from public.events e
   where e.id = p_event;

  -- A zone Postgres does not know is read as UTC, exactly as the app falls
  -- back when Intl does not know it, rather than failing the save.
  begin
    v_today := (statement_timestamp() at time zone coalesce(v_zone, 'UTC'))::date;
  exception when invalid_parameter_value then
    v_today := (statement_timestamp() at time zone 'UTC')::date;
  end;

  -- Match gridSlots(): the plan's today and the six days after it, four band
  -- labels each. The server action checks too, but this function is an
  -- authenticated RPC and therefore must defend itself from direct callers.
  if exists (
    select 1
    from unnest(coalesce(p_slots, '{}'::timestamptz[])) as proposed(slot)
    where proposed.slot is null
       or (proposed.slot at time zone 'UTC')::date < v_today
       or (proposed.slot at time zone 'UTC')::date > v_today + 6
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

revoke all on function private.replace_event_availability(uuid, timestamptz[])
  from public, anon;
grant execute on function private.replace_event_availability(uuid, timestamptz[])
  to authenticated, service_role;

create or replace function public.replace_event_availability(
  p_event uuid,
  p_slots timestamptz[]
)
returns void
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.replace_event_availability(p_event, p_slots);
$$;

revoke all on function public.replace_event_availability(uuid, timestamptz[])
  from public, anon;
grant execute on function public.replace_event_availability(uuid, timestamptz[])
  to authenticated;

-- ————————————————————————— calendar busy time —————————————————————————
--
-- The stored rows are UTC bands in the old sense, which no plan outside UTC
-- can use. They are derived data — the feed is re-read on demand — so they are
-- cleared rather than approximated, and each connection's coverage is moved
-- before any grid's first slot. The grid then reads "not checked yet", which
-- makes its "Fill from my calendar" button re-read the feed itself on the next
-- press (AvailabilityGrid.refreshCoverage), instead of filling from a week of
-- bands in the wrong zone. The connection itself (`usable`) is unaffected.
delete from public.calendar_busy;

update public.calendar_subscriptions
   set covered_through = least(covered_through, date_trunc('day', now()) - interval '2 days')
 where covered_through is not null;

comment on table public.calendar_busy is
  'A person''s busy time from their connected calendar, as the start of each busy quarter-hour (a real instant). No titles, places or attendees. Private to its owner; each plan''s grid turns it into that plan''s bands in the plan''s zone (busyBandsFromStored).';
