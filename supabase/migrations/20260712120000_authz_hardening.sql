-- Authorization hardening (audit findings F1-F6).
--
-- Root cause behind F1/F2/F5: an UPDATE policy written with only a `USING`
-- clause and no `WITH CHECK`. Postgres then reuses `USING` as the check, which
-- gates WHICH ROWS you may update but NOT what the updated row may become —
-- and RLS can never compare OLD vs NEW, so a policy alone cannot freeze an
-- ownership/foreign-key column. Each fix below pairs an explicit `WITH CHECK`
-- with a `BEFORE UPDATE` trigger that pins the columns which must never move
-- once set. See docs/SECURITY.md ("Row ownership is immutable").

-- ————————————————————————— F1 (HIGH) —————————————————————————
-- connections_update was `using (addressee_id = auth.uid())` with no WITH CHECK
-- (init.sql:411). The addressee could repoint `requester_id` to an arbitrary
-- victim and flip `status` to 'accepted', forging a mutual connection with no
-- consent from the victim — and bypassing the `are_blocked` guard that only
-- runs on INSERT. An accepted connection unlocks shared identity facets,
-- availability signals, matchmaker/ritual eligibility, and compatibility.
--
-- The accept flow only ever moves status pending -> accepted on an existing row
-- whose parties are fixed, so freezing both party columns costs legitimate use
-- nothing.
create or replace function public.freeze_connection_parties()
returns trigger language plpgsql as $$
begin
  if new.requester_id is distinct from old.requester_id
     or new.addressee_id is distinct from old.addressee_id then
    raise exception 'connection parties are immutable';
  end if;
  return new;
end $$;

drop trigger if exists connections_freeze_parties on public.connections;
create trigger connections_freeze_parties
  before update on public.connections
  for each row execute function public.freeze_connection_parties();

drop policy if exists connections_update on public.connections;
create policy connections_update on public.connections for update to authenticated
  using (addressee_id = auth.uid())
  with check (addressee_id = auth.uid());

-- ————————————————————————— F2 (MEDIUM) —————————————————————————
-- events_update was `using (is_event_host(id, auth.uid()))` with no WITH CHECK
-- (cohost_policy_parity.sql:12). A co-host (is_event_host is true for them)
-- could set `host_id = auth.uid()` and seize the primary-host-only powers that
-- are deliberately withheld from co-hosts: deleting the event (events_delete
-- keys on host_id) and managing the co-host roster (event_cohosts_host keys on
-- host_id). There is no host-transfer feature, so host_id is immutable.
create or replace function public.freeze_event_host()
returns trigger language plpgsql as $$
begin
  if new.host_id is distinct from old.host_id then
    raise exception 'event host is immutable';
  end if;
  return new;
end $$;

drop trigger if exists events_freeze_host on public.events;
create trigger events_freeze_host
  before update on public.events
  for each row execute function public.freeze_event_host();

drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (public.is_event_host(id, auth.uid()))
  with check (public.is_event_host(id, auth.uid()));

-- ————————————————————————— F3 (LOW/MED) —————————————————————————
-- rooms_insert allowed any authenticated user to create a bare `rooms` row
-- (init.sql:419), after which room_members_insert (creator-adds-member) let
-- them force arbitrary victims into a room they control — an unsolicited
-- chat/DM channel (harassment/spam). No application flow creates rooms through
-- the user client: every real room is minted inside a SECURITY DEFINER function
-- (create_event_atomic, the match trigger, recurring events, rituals), which
-- bypasses RLS. So the policy is unused attack surface, exactly like the C1
-- self-insert. Remove it; legitimate room creation is unaffected, and
-- room_members can now only be added to definer-created (event/match) rooms by
-- their legitimate host.
drop policy if exists rooms_insert on public.rooms;

-- ————————————————————————— F5 (LOW) —————————————————————————
-- Same missing-WITH-CHECK pattern on two more tables, each letting a
-- participant repoint an ownership FK to gain a right reserved for the owner.
--   * rituals_update (innovations.sql:132): either participant could set
--     creator_id/partner_id.
--   * boards_update (neighborhood_boards.sql:61): a moderator could set
--     created_by = self and inherit the creator-only delete right.
create or replace function public.freeze_ritual_parties()
returns trigger language plpgsql as $$
begin
  if new.creator_id is distinct from old.creator_id
     or new.partner_id is distinct from old.partner_id then
    raise exception 'ritual parties are immutable';
  end if;
  return new;
end $$;

drop trigger if exists rituals_freeze_parties on public.rituals;
create trigger rituals_freeze_parties
  before update on public.rituals
  for each row execute function public.freeze_ritual_parties();

drop policy if exists rituals_update on public.rituals;
create policy rituals_update on public.rituals for update to authenticated
  using (creator_id = auth.uid() or partner_id = auth.uid())
  with check (creator_id = auth.uid() or partner_id = auth.uid());

create or replace function public.freeze_board_owner()
returns trigger language plpgsql as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'board owner is immutable';
  end if;
  return new;
end $$;

drop trigger if exists boards_freeze_owner on public.boards;
create trigger boards_freeze_owner
  before update on public.boards
  for each row execute function public.freeze_board_owner();

drop policy if exists boards_update on public.boards;
create policy boards_update on public.boards for update to authenticated
  using (public.is_board_moderator(id, auth.uid()))
  with check (public.is_board_moderator(id, auth.uid()));

-- ————————————————————————— F6 (LOW) —————————————————————————
-- The discovery feed, contact matching, and the connection-request INSERT all
-- consult are_blocked, but the raw mutual_intents INSERT did not (init.sql:489):
-- a user blocked by their target could still record a reciprocal intent and, if
-- the target held a live intent toward them, trip the matching trigger into an
-- auto-created match + shared room. Gate the write on the block relation too, so
-- a block is honored on every path.
drop policy if exists mutual_intents_own on public.mutual_intents;
create policy mutual_intents_own on public.mutual_intents for all to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and (target_id is null or not public.are_blocked(auth.uid(), target_id))
  );
