-- Co-hosts can open the plans they co-host (completion plan P1, decision D1).
--
-- A co-host shares the host's powers — `is_event_host` is true for them, and
-- every host-gated write policy and definer function already admits them. What
-- they could not do was READ the plan: `can_view_event` covered the primary
-- host and invitees only, so a co-host who had not also been invited was
-- redirected from /events/<id> to /join/<id>, never saw a single host control,
-- and never found the plan on /plans or in their calendar feed. The same gap in
-- `invites_select` meant that a co-host's own delete of an Open Table request
-- (`invites_delete` admits them) matched zero rows: a DELETE only reaches rows
-- the caller may SELECT.
--
-- D1 narrows who may become a co-host: only the primary host's accepted
-- connections, or people already on this plan's guest list. A handle alone is
-- no longer enough, because co-hosting hands over the guest list, every
-- guest's contact card, and the power to cancel — not something to give a
-- stranger by typo. The rule lives in the row-level policy the app writes
-- through, so a direct API write is held to it as well.

-- ————————————————————————— 1. co-hosts can view the plan —————————————————————
-- Every policy that asks "may this person see the plan" (events, polls,
-- questions, availability, poll votes, the thread) follows this function's OID,
-- so adding co-hosts here reaches all of them at once. The invitee branch is
-- unchanged from 20260707140000: live invites, or any invite while the group
-- is still deciding.
create or replace function private.can_view_event(p_event uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event and e.host_id = p_user
  ) or exists (
    select 1 from public.event_cohosts c
    where c.event_id = p_event and c.cohost_id = p_user
  ) or exists (
    select 1 from public.invites i
    join public.events e on e.id = i.event_id
    where i.event_id = p_event
      and i.invitee_id = p_user
      and (i.status <> 'queued' or e.status = 'deciding')
  );
$$;

revoke all on function private.can_view_event(uuid, uuid) from public, anon;
grant execute on function private.can_view_event(uuid, uuid)
  to authenticated, service_role;

-- ————————————————————————— 2. co-hosts can read the guest list ————————————————
-- Parity with invites_insert / invites_delete (20260710123000), which already
-- route through is_event_host. A co-host managing Open Table requests needs to
-- see the rows they are approving or turning away; the plan page already shows
-- them the same rows through its own `canManage` gate.
alter policy invites_select on public.invites
  using (
    private.is_event_host(event_id, (select auth.uid()))
    or (invitee_id = (select auth.uid()) and status <> 'queued')
  );

-- ————————————————————————— 3. who may become a co-host (D1) ———————————————————
-- True when `p_cohost` is someone the plan's primary host may hand host powers
-- to: an accepted connection of the host, or someone on this plan's guest list
-- (any invite except an Open Table request the host has not let in). Never the
-- host themselves, and never across a block in either direction.
create or replace function private.cohost_eligible(p_event uuid, p_cohost uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_cohost is not null and exists (
    select 1 from public.events e
    where e.id = p_event
      and e.host_id <> p_cohost
      and not private.are_blocked(e.host_id, p_cohost)
      and (
        private.are_connected(e.host_id, p_cohost)
        or exists (
          select 1 from public.invites i
          where i.event_id = p_event
            and i.invitee_id = p_cohost
            and i.status <> 'requested'
        )
      )
  );
$$;

revoke all on function private.cohost_eligible(uuid, uuid) from public, anon;
grant execute on function private.cohost_eligible(uuid, uuid)
  to authenticated, service_role;

-- The roster stays primary-host-only (co-hosts cannot mint co-hosts); the
-- WITH CHECK now also requires the person being added to be eligible. The
-- USING clause is unchanged, so removing a co-host is never blocked by who
-- they have become since.
alter policy event_cohosts_host on public.event_cohosts
  using (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.host_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.events e
      where e.id = event_id and e.host_id = (select auth.uid())
    )
    and private.cohost_eligible(event_id, cohost_id)
  );
