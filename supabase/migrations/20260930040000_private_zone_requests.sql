-- Private zones: a decision reaches the person it was about (P10, D10).
--
-- A denied requester, or a member someone removed, landed back on the zone's
-- door, saw "Ask to join", asked, and was told "Asked" — while nothing
-- happened. `zone_join_requests` holds one row per (zone, requester), so the
-- new insert hit the old `denied` or `approved` row and failed with 23505,
-- which the action read as "you already asked". Nobody was told, nobody could
-- ask again, and the screen said otherwise.
--
-- D10: tell them, and allow one new request after 30 days.
--
--   - Every decision is timestamped (`decided_at`), and `asks` counts how many
--     times this person has knocked: the first ask, plus at most one more.
--   - Asking goes through `request_zone_join`, a definer that answers with what
--     actually happened: a new request, one already waiting, "you can ask again
--     on <date>", or "no more asks". The direct INSERT policy is gone, so there
--     is exactly one way in and it cannot be talked past.
--   - A requester may withdraw a request that is still waiting, never a
--     decision: deleting a denied row used to be the way around any cooldown.
--   - Leaving is always free. Being removed by a moderator is recorded like a
--     denial, so the same 30-day rule applies to someone who was shown out.
--     Either way their open check-in there ends, because a zone's headcount and
--     its shared moments should only ever describe the people in it.

-- ————————————————————————— schema —————————————————————————

alter table public.zone_join_requests
  add column if not exists decided_at timestamptz,
  add column if not exists asks integer not null default 1;

alter table public.zone_join_requests
  drop constraint if exists zone_join_requests_asks_check;
alter table public.zone_join_requests
  add constraint zone_join_requests_asks_check check (asks between 1 and 2);

-- 'removed' is a moderator taking someone out of the zone. It is a decision
-- about that person, so it lives on the same row as their request.
alter table public.zone_join_requests
  drop constraint if exists zone_join_requests_status_check;
alter table public.zone_join_requests
  add constraint zone_join_requests_status_check
  check (status in ('pending', 'approved', 'denied', 'removed'));

-- Rows decided before this migration have no decision time. Their request time
-- is the closest thing on record, and it errs toward letting people ask again.
update public.zone_join_requests
   set decided_at = created_at
 where status = 'denied'
   and decided_at is null;

-- Someone once let in and no longer in the zone was removed or left before
-- this migration could tell the two apart. Record it as a removal dated at
-- their request, so they get their one new ask without an arbitrary wait.
update public.zone_join_requests r
   set status = 'removed',
       decided_at = coalesce(r.decided_at, r.created_at)
 where r.status = 'approved'
   and not private.is_zone_member(r.zone_id, r.requester_id);

-- ————————————————————————— policies —————————————————————————

-- Asking is `request_zone_join` only.
drop policy if exists zone_join_requests_insert on public.zone_join_requests;

-- A requester can take back a request that is still waiting. A decision is not
-- theirs to erase; a moderator may clear one (which gives the person a clean
-- slate, and is theirs to give).
alter policy zone_join_requests_delete on public.zone_join_requests
  using (
    (requester_id = (select auth.uid()) and status = 'pending')
    or private.is_zone_moderator(zone_id, (select auth.uid()))
  );

-- ————————————————————————— asking —————————————————————————

-- Outcomes:
--   requested    a new request (or a reopened one) is waiting; tell moderators
--   pending      one was already waiting; nobody is told twice
--   member       the caller is already in
--   wait         denied or removed less than 30 days ago; `retry_after` says when
--   closed       they have used their one new ask
--   unavailable  no such zone, or it is not private (nothing to ask for)
create or replace function private.request_zone_join(
  p_zone uuid,
  p_note text default null
)
returns table (outcome text, retry_after timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_visibility text;
  v_request public.zone_join_requests%rowtype;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 280), '');
  v_new uuid;
  v_reopens_at timestamptz;
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;

  select z.visibility into v_visibility from public.zones z where z.id = p_zone;
  if v_visibility is distinct from 'private' then
    return query select 'unavailable'::text, null::timestamptz;
    return;
  end if;

  if private.is_zone_member(p_zone, v_user) then
    return query select 'member'::text, null::timestamptz;
    return;
  end if;

  select * into v_request
    from public.zone_join_requests r
   where r.zone_id = p_zone and r.requester_id = v_user
   for update;

  if not found then
    insert into public.zone_join_requests (zone_id, requester_id, note, status)
    values (p_zone, v_user, v_note, 'pending')
    on conflict (zone_id, requester_id) do nothing
    returning id into v_new;
    -- A concurrent ask won the insert; that one stands and was announced.
    return query select
      case when v_new is null then 'pending' else 'requested' end,
      null::timestamptz;
    return;
  end if;

  if v_request.status = 'pending' then
    return query select 'pending'::text, null::timestamptz;
    return;
  end if;

  -- Let in once, and no longer in: they left before leaving cleared the row.
  -- Leaving is free, so this is a fresh ask rather than a second one.
  if v_request.status = 'approved' then
    update public.zone_join_requests
       set status = 'pending', note = v_note, created_at = now(), decided_at = null
     where id = v_request.id;
    return query select 'requested'::text, null::timestamptz;
    return;
  end if;

  -- Denied, or removed by a moderator: one more ask, 30 days after the decision.
  if v_request.asks >= 2 then
    return query select 'closed'::text, null::timestamptz;
    return;
  end if;

  v_reopens_at :=
    coalesce(v_request.decided_at, v_request.created_at) + interval '30 days';
  if v_reopens_at > now() then
    return query select 'wait'::text, v_reopens_at;
    return;
  end if;

  update public.zone_join_requests
     set status = 'pending',
         note = v_note,
         asks = v_request.asks + 1,
         created_at = now(),
         decided_at = null
   where id = v_request.id;
  return query select 'requested'::text, null::timestamptz;
end;
$$;

revoke all on function private.request_zone_join(uuid, text) from public, anon;
grant execute on function private.request_zone_join(uuid, text)
  to authenticated, service_role;

create or replace function public.request_zone_join(
  p_zone uuid,
  p_note text default null
)
returns table (outcome text, retry_after timestamptz)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.request_zone_join(p_zone, p_note);
$$;

revoke all on function public.request_zone_join(uuid, text) from public, anon;
grant execute on function public.request_zone_join(uuid, text)
  to authenticated, service_role;

-- ————————————————————————— deciding —————————————————————————
-- Unchanged in who may decide and what approval writes; it now records when,
-- which is what the 30-day rule is measured from.
create or replace function public.resolve_zone_join_request(
  p_request uuid,
  p_approve boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone uuid;
  v_requester uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;

  select zone_id, requester_id into v_zone, v_requester
    from public.zone_join_requests
    where id = p_request and status = 'pending'
    for update;
  if v_zone is null then return false; end if;

  if not private.is_zone_moderator(v_zone, auth.uid()) then
    raise exception 'not a moderator of this zone';
  end if;

  if p_approve then
    insert into public.zone_members (zone_id, member_id, role)
      values (v_zone, v_requester, 'member')
      on conflict (zone_id, member_id) do nothing;
    update public.zone_join_requests
       set status = 'approved', decided_at = now()
     where id = p_request;
  else
    update public.zone_join_requests
       set status = 'denied', decided_at = now()
     where id = p_request;
  end if;

  return true;
end $$;

revoke all on function public.resolve_zone_join_request(uuid, boolean) from public, anon;
grant execute on function public.resolve_zone_join_request(uuid, boolean) to authenticated;

-- ————————————————————————— leaving and removal —————————————————————————
create or replace function private.on_zone_member_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A zone or an account being deleted cascades here. There is nobody left to
  -- record a decision about, and nothing to hold against anyone.
  if not exists (select 1 from public.zones z where z.id = old.zone_id)
     or not exists (select 1 from public.profiles p where p.id = old.member_id) then
    return old;
  end if;

  -- Out of the zone means out of its headcount and its shared moments. A close
  -- that leaves zone_id as it was is the one write the check-in gate always
  -- allows (20260929120000_moment_zone_checkout.sql).
  update public.moments m
     set status = 'closed'
   where m.user_id = old.member_id
     and m.zone_id = old.zone_id
     and m.status = 'open';

  if (select auth.uid()) = old.member_id then
    -- They left. Nothing about that should count against asking back in.
    delete from public.zone_join_requests r
     where r.zone_id = old.zone_id and r.requester_id = old.member_id;
  else
    -- A moderator showed them out: the same rule as a denial.
    insert into public.zone_join_requests (zone_id, requester_id, status, decided_at)
    values (old.zone_id, old.member_id, 'removed', now())
    on conflict (zone_id, requester_id) do update
      set status = 'removed', decided_at = now();
  end if;
  return old;
end;
$$;

revoke all on function private.on_zone_member_removed() from public, anon, authenticated;
grant execute on function private.on_zone_member_removed() to service_role;

drop trigger if exists zone_members_after_delete on public.zone_members;
create trigger zone_members_after_delete
  after delete on public.zone_members
  for each row execute function private.on_zone_member_removed();
