-- Private zones, and an owner who can actually manage access.
--
-- Zones shipped world-readable: `zones_select ... using (true)`
-- (20260703200000_innovations.sql). Every zone — a company offsite, a wedding
-- weekend, a recovery meetup, a school trip — was listed to every authenticated
-- user, appeared on the shared map if anchored, and its organizer had no
-- control of any kind. Boards, built four days later for the same "a group of
-- people with a shared place" need, got invite-only RLS, roles, and rotatable
-- join links. Zones simply never got that pass.
--
-- This is that pass, deliberately mirroring boards rather than inventing a
-- second access model (docs/DOCKET.md, "a reachability policy ... one engine,
-- many surfaces"):
--
--   zones.visibility  public | private
--   zone_members      roster + role, exactly like board_members
--   zones.invite_code rotatable capability link, exactly like boards
--   zone_join_requests request-to-approve, the piece boards do by handle
--
-- Every reader inherits the restriction for free, because every zone surface
-- (the /zones list, /zones/[slug], the map's Zones layer, locateMyPlaces) reads
-- `public.zones` through the caller's RLS client. Tightening the policy fixes
-- them all at once; none of them had to learn a new rule. That is the whole
-- reason the privacy lives here and not in the pages.
--
-- Security posture (docs/SECURITY.md):
--   - the invite code IS the capability; minting/rotating is organizer-only and
--     redeeming can never grant a role above 'member'.
--   - membership is never a self-writable row: base RLS lets only organizers
--     and moderators insert, and the join paths run in SECURITY DEFINER
--     functions that re-check the caller and the specific zone.
--   - `zone_id`, `member_id`, and `organizer_id` are frozen by trigger, since
--     RLS cannot compare OLD to NEW.
--   - every UPDATE policy states an explicit WITH CHECK
--     (20260717140000_explicit_update_policy_checks.sql).

-- ————————————————————————— schema —————————————————————————

alter table public.zones
  add column if not exists visibility text not null default 'public',
  add column if not exists invite_code text unique;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'zones_visibility_check'
  ) then
    alter table public.zones
      add constraint zones_visibility_check
      check (visibility in ('public', 'private'));
  end if;
end $$;

create table if not exists public.zone_members (
  zone_id uuid not null references public.zones(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator')),
  joined_at timestamptz not null default now(),
  primary key (zone_id, member_id)
);

-- Request-to-approve, for a private zone whose organizer would rather vet
-- people than hand out a link. Mirrors the event join-request shape: the
-- request itself is the only thing a non-member may write.
create table if not exists public.zone_join_requests (
  id uuid primary key default gen_random_uuid(),
  zone_id uuid not null references public.zones(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  note text check (char_length(note) <= 280),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  unique (zone_id, requester_id)
);

create index if not exists zone_members_member_idx
  on public.zone_members (member_id);
create index if not exists zone_join_requests_zone_idx
  on public.zone_join_requests (zone_id, status);

-- ————————————————————————— helpers —————————————————————————
-- SECURITY DEFINER so a policy on zone_members can consult zone_members
-- without recursing through its own RLS — the is_board_member precedent.

create or replace function public.is_zone_member(p_zone uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    exists (
      select 1 from public.zones z
      where z.id = p_zone and z.organizer_id = p_user
    )
    or exists (
      select 1 from public.zone_members m
      where m.zone_id = p_zone and m.member_id = p_user
    )
  );
$$;

-- The organizer is always a moderator of their own zone, so a zone is never
-- left without someone who can manage it.
create or replace function public.is_zone_moderator(p_zone uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_user is not null and (
    exists (
      select 1 from public.zones z
      where z.id = p_zone and z.organizer_id = p_user
    )
    or exists (
      select 1 from public.zone_members m
      where m.zone_id = p_zone and m.member_id = p_user and m.role = 'moderator'
    )
  );
$$;

-- Can this viewer read this zone at all? Public zones stay world-readable, so
-- serendipity at a conference or festival keeps working exactly as before.
create or replace function public.can_view_zone(p_zone uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.zones z
    where z.id = p_zone
      and (z.visibility = 'public' or public.is_zone_member(p_zone, p_user))
  );
$$;

-- ————————————————————————— policies —————————————————————————

drop policy if exists zones_select on public.zones;
create policy zones_select on public.zones for select to authenticated
  using (visibility = 'public' or public.is_zone_member(id, auth.uid()));

-- Was `using (organizer_id = auth.uid())` with no WITH CHECK, so the organizer
-- could rewrite organizer_id and hand the zone away (or take one, had the USING
-- clause ever widened). Moderators can now curate; only the organizer's own
-- row-ownership stays pinned by the trigger below.
drop policy if exists zones_update on public.zones;
create policy zones_update on public.zones for update to authenticated
  using (public.is_zone_moderator(id, auth.uid()))
  with check (public.is_zone_moderator(id, auth.uid()));

drop policy if exists zones_delete on public.zones;
create policy zones_delete on public.zones for delete to authenticated
  using (organizer_id = auth.uid());

create or replace function public.freeze_zone_owner()
returns trigger language plpgsql as $$
begin
  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'zone organizer is immutable';
  end if;
  return new;
end $$;

drop trigger if exists zones_freeze_owner on public.zones;
create trigger zones_freeze_owner
  before update on public.zones
  for each row execute function public.freeze_zone_owner();

alter table public.zone_members enable row level security;
alter table public.zone_join_requests enable row level security;

-- The roster is readable by the people on it. Adding someone is a moderator
-- act; you can always remove yourself, and a moderator can remove others.
create policy zone_members_select on public.zone_members for select to authenticated
  using (public.is_zone_member(zone_id, auth.uid()));
create policy zone_members_insert on public.zone_members for insert to authenticated
  with check (public.is_zone_moderator(zone_id, auth.uid()));
create policy zone_members_update on public.zone_members for update to authenticated
  using (public.is_zone_moderator(zone_id, auth.uid()))
  with check (public.is_zone_moderator(zone_id, auth.uid()));
create policy zone_members_delete on public.zone_members for delete to authenticated
  using (member_id = auth.uid() or public.is_zone_moderator(zone_id, auth.uid()));

create or replace function public.freeze_zone_membership()
returns trigger language plpgsql as $$
begin
  if new.zone_id is distinct from old.zone_id
     or new.member_id is distinct from old.member_id then
    raise exception 'zone membership identity is immutable';
  end if;
  return new;
end $$;

drop trigger if exists zone_members_freeze on public.zone_members;
create trigger zone_members_freeze
  before update on public.zone_members
  for each row execute function public.freeze_zone_membership();

-- A request is the one thing a non-member may write, and only for themselves.
-- Status is moved by the definer functions below, never by the requester, so
-- there is no self-approval path.
create policy zone_join_requests_select on public.zone_join_requests
  for select to authenticated
  using (requester_id = auth.uid() or public.is_zone_moderator(zone_id, auth.uid()));
create policy zone_join_requests_insert on public.zone_join_requests
  for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy zone_join_requests_delete on public.zone_join_requests
  for delete to authenticated
  using (requester_id = auth.uid() or public.is_zone_moderator(zone_id, auth.uid()));

-- ————————————————————————— checking in —————————————————————————
-- A moment carries `zone_id`, and `moments` is owner-only under RLS, so nothing
-- stopped someone from checking into a private zone they cannot even read —
-- which would have shown up in that zone's presence count. The count is the one
-- thing that crosses the member boundary (20260810120000_zone_presence.sql), so
-- the gate belongs on the write.

create or replace function public.enforce_zone_checkin_access()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.zone_id is not null
     and not public.can_view_zone(new.zone_id, new.user_id) then
    raise exception 'cannot check into a zone you are not part of';
  end if;
  return new;
end $$;

drop trigger if exists moments_zone_access on public.moments;
create trigger moments_zone_access
  before insert or update on public.moments
  for each row execute function public.enforce_zone_checkin_access();

-- ————————————————————————— join paths —————————————————————————

-- Mint (or return) the zone's invite code. Organizer/moderator only.
create or replace function public.ensure_zone_invite_code(p_zone uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_zone_moderator(p_zone, auth.uid()) then
    raise exception 'not a moderator of this zone';
  end if;

  select invite_code into v_code from public.zones where id = p_zone;
  if v_code is null then
    v_code := replace(gen_random_uuid()::text, '-', '');
    update public.zones set invite_code = v_code where id = p_zone;
  end if;
  return v_code;
end $$;

-- Rotate the code, invalidating every link already shared.
create or replace function public.rotate_zone_invite_code(p_zone uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_zone_moderator(p_zone, auth.uid()) then
    raise exception 'not a moderator of this zone';
  end if;

  v_code := replace(gen_random_uuid()::text, '-', '');
  update public.zones set invite_code = v_code where id = p_zone;
  return v_code;
end $$;

-- Redeem a code: join as a plain member, and return the slug so the client can
-- route there. Null for an unknown code. Idempotent.
create or replace function public.join_zone_via_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_id uuid;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_code is null or char_length(btrim(p_code)) = 0 then return null; end if;

  select id, slug into v_zone_id, v_slug
    from public.zones where invite_code = p_code;
  if v_zone_id is null then return null; end if;

  -- Never above 'member': a shared link cannot mint a moderator.
  insert into public.zone_members (zone_id, member_id, role)
    values (v_zone_id, auth.uid(), 'member')
    on conflict (zone_id, member_id) do nothing;

  -- A pending request is satisfied by walking in the front door.
  update public.zone_join_requests
    set status = 'approved'
    where zone_id = v_zone_id and requester_id = auth.uid() and status = 'pending';

  return v_slug;
end $$;

-- Knocking on the door.
--
-- Someone handed a zone's URL by a friend, before anyone thought to send them
-- the join link, would otherwise get a flat 404 — the same answer as a zone
-- that never existed, with no way forward. This returns the bare minimum
-- needed to render "ask to be let in": the id, the display name, and whether
-- they have already asked.
--
-- It is deliberately keyed by exact slug and returns at most one row, so it
-- answers "does this specific address exist" and cannot be used to enumerate
-- private zones. No description, no roster, no coordinates, no organizer — the
-- name is what a person needs to decide whether they are in the right place.
create or replace function public.find_private_zone_by_slug(p_slug text)
returns table (id uuid, name text, request_pending boolean)
language sql
stable
security definer
set search_path = public
as $$
  select z.id,
         z.name,
         exists (
           select 1 from public.zone_join_requests r
           where r.zone_id = z.id
             and r.requester_id = auth.uid()
             and r.status = 'pending'
         )
  from public.zones z
  where z.slug = p_slug
    and z.visibility = 'private'
    and auth.uid() is not null
    and not public.is_zone_member(z.id, auth.uid())
  limit 1;
$$;

-- Approve (or deny) a pending request. Moderator-only, and approving is the
-- only path that writes the roster from a request.
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

  if not public.is_zone_moderator(v_zone, auth.uid()) then
    raise exception 'not a moderator of this zone';
  end if;

  if p_approve then
    insert into public.zone_members (zone_id, member_id, role)
      values (v_zone, v_requester, 'member')
      on conflict (zone_id, member_id) do nothing;
    update public.zone_join_requests set status = 'approved' where id = p_request;
  else
    update public.zone_join_requests set status = 'denied' where id = p_request;
  end if;

  return true;
end $$;

revoke all on function public.ensure_zone_invite_code(uuid) from public, anon;
revoke all on function public.rotate_zone_invite_code(uuid) from public, anon;
revoke all on function public.join_zone_via_code(text) from public, anon;
revoke all on function public.resolve_zone_join_request(uuid, boolean) from public, anon;

grant execute on function public.is_zone_member(uuid, uuid) to authenticated;
grant execute on function public.is_zone_moderator(uuid, uuid) to authenticated;
grant execute on function public.can_view_zone(uuid, uuid) to authenticated;
grant execute on function public.ensure_zone_invite_code(uuid) to authenticated;
grant execute on function public.rotate_zone_invite_code(uuid) to authenticated;
grant execute on function public.join_zone_via_code(text) to authenticated;
grant execute on function public.resolve_zone_join_request(uuid, boolean) to authenticated;
revoke all on function public.find_private_zone_by_slug(text) from public, anon;
grant execute on function public.find_private_zone_by_slug(text) to authenticated;
