-- Switchboard innovations wave 1: matchmaker, rituals, energy, capsules,
-- venues, households, zones, open table, join requests.

-- ————————————————————————— third-party matchmaker —————————————————————————
-- Identity masking rule: participants never see who the other person is
-- until BOTH accept. The table has no participant select policy; all
-- participant access flows through the masked functions below.
create table public.matchmaker_proposals (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles(id) on delete cascade,
  person_a uuid not null references public.profiles(id) on delete cascade,
  person_b uuid not null references public.profiles(id) on delete cascade,
  activity text not null,
  note text,
  a_response text not null default 'pending' check (a_response in ('pending', 'accepted', 'declined')),
  b_response text not null default 'pending' check (b_response in ('pending', 'accepted', 'declined')),
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now(),
  check (person_a <> person_b),
  check (proposer_id <> person_a),
  check (proposer_id <> person_b)
);
alter table public.matchmaker_proposals enable row level security;

create policy matchmaker_proposer_select on public.matchmaker_proposals
  for select to authenticated using (proposer_id = auth.uid());
create policy matchmaker_proposer_insert on public.matchmaker_proposals
  for insert to authenticated with check (
    proposer_id = auth.uid()
    and public.are_connected(auth.uid(), person_a)
    and public.are_connected(auth.uid(), person_b)
  );
create policy matchmaker_proposer_delete on public.matchmaker_proposals
  for delete to authenticated using (proposer_id = auth.uid() and status = 'open');

-- Masked view for participants: proposer is named, the other person is not.
create or replace function public.my_matchmaker_proposals()
returns table (
  id uuid,
  activity text,
  note text,
  proposer_name text,
  my_response text,
  status text,
  room_id uuid,
  other_name text,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select
    p.id,
    p.activity,
    p.note,
    prof.display_name,
    case when p.person_a = auth.uid() then p.a_response else p.b_response end,
    p.status,
    p.room_id,
    case when p.status = 'matched' then other.display_name else null end,
    p.created_at
  from public.matchmaker_proposals p
  join public.profiles prof on prof.id = p.proposer_id
  join public.profiles other
    on other.id = case when p.person_a = auth.uid() then p.person_b else p.person_a end
  where (p.person_a = auth.uid() or p.person_b = auth.uid())
    and p.status <> 'closed';
$$;

create or replace function public.respond_to_matchmaker(p_proposal uuid, p_accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare
  v public.matchmaker_proposals%rowtype;
  v_room uuid;
begin
  select * into v from public.matchmaker_proposals where id = p_proposal for update;
  if not found then raise exception 'proposal not found'; end if;
  if auth.uid() not in (v.person_a, v.person_b) then
    raise exception 'not your proposal';
  end if;
  if v.status <> 'open' then return v.status; end if;

  if v.person_a = auth.uid() then
    update public.matchmaker_proposals
      set a_response = case when p_accept then 'accepted' else 'declined' end
      where id = p_proposal;
  else
    update public.matchmaker_proposals
      set b_response = case when p_accept then 'accepted' else 'declined' end
      where id = p_proposal;
  end if;

  select * into v from public.matchmaker_proposals where id = p_proposal;

  if v.a_response = 'declined' or v.b_response = 'declined' then
    update public.matchmaker_proposals set status = 'closed' where id = p_proposal;
    return 'closed';
  end if;

  if v.a_response = 'accepted' and v.b_response = 'accepted' then
    insert into public.rooms (kind, title, created_by)
      values ('match', v.activity, v.proposer_id)
      returning id into v_room;
    insert into public.room_members (room_id, member_id)
      values (v_room, v.person_a), (v_room, v.person_b);
    insert into public.matches (user_a, user_b, activity, kind, room_id)
      values (least(v.person_a, v.person_b), greatest(v.person_a, v.person_b),
              v.activity, 'down_to_connect', v_room);
    update public.matchmaker_proposals
      set status = 'matched', room_id = v_room where id = p_proposal;
    return 'matched';
  end if;
  return 'open';
end $$;

-- ————————————————————————— standing rituals —————————————————————————
create table public.rituals (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  partner_id uuid not null references public.profiles(id) on delete cascade,
  activity text not null,
  cadence_days int not null check (cadence_days between 1 and 365),
  status text not null default 'proposed' check (status in ('proposed', 'active', 'paused', 'ended')),
  last_planned_at timestamptz,
  created_at timestamptz not null default now(),
  check (creator_id <> partner_id)
);
alter table public.rituals enable row level security;
create policy rituals_participants on public.rituals
  for select to authenticated using (creator_id = auth.uid() or partner_id = auth.uid());
create policy rituals_insert on public.rituals
  for insert to authenticated
  with check (creator_id = auth.uid() and public.are_connected(auth.uid(), partner_id));
create policy rituals_update on public.rituals
  for update to authenticated using (creator_id = auth.uid() or partner_id = auth.uid());
create policy rituals_delete on public.rituals
  for delete to authenticated using (creator_id = auth.uid() or partner_id = auth.uid());

-- ————————————————————————— social battery —————————————————————————
create table public.energy_logs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  feeling text not null check (feeling in ('filled', 'neutral', 'drained')),
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
alter table public.energy_logs enable row level security;
create policy energy_own on public.energy_logs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ————————————————————————— memory capsules —————————————————————————
create table public.capsule_entries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  line text not null check (char_length(line) between 1 and 280),
  photo_url text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.capsule_entries enable row level security;
create policy capsule_select on public.capsule_entries
  for select to authenticated using (public.can_view_event(event_id, auth.uid()));
create policy capsule_insert on public.capsule_entries
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_view_event(event_id, auth.uid()));
create policy capsule_update on public.capsule_entries
  for update to authenticated using (user_id = auth.uid());
create policy capsule_delete on public.capsule_entries
  for delete to authenticated using (user_id = auth.uid());

-- ————————————————————————— venues —————————————————————————
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  area text,
  perk text not null,
  url text,
  claimed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.venues enable row level security;
create policy venues_select on public.venues for select to authenticated using (true);
create policy venues_insert on public.venues
  for insert to authenticated with check (claimed_by = auth.uid());
create policy venues_update on public.venues
  for update to authenticated using (claimed_by = auth.uid());
create policy venues_delete on public.venues
  for delete to authenticated using (claimed_by = auth.uid());

-- ————————————————————————— households —————————————————————————
create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '🏡',
  created_at timestamptz not null default now()
);
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  primary key (household_id, member_id)
);
alter table public.households enable row level security;
alter table public.household_members enable row level security;
create policy households_owner on public.households
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy households_member_select on public.households
  for select to authenticated
  using (exists (select 1 from public.household_members hm where hm.household_id = id and hm.member_id = auth.uid()));
create policy household_members_owner on public.household_members
  for all to authenticated
  using (exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from public.households h where h.id = household_id and h.owner_id = auth.uid()));
create policy household_members_self_select on public.household_members
  for select to authenticated using (member_id = auth.uid());

-- ————————————————————————— serendipity zones —————————————————————————
create table public.zones (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  description text,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  experiences text[] not null default '{}',
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.zones enable row level security;
create policy zones_select on public.zones for select to authenticated using (true);
create policy zones_insert on public.zones
  for insert to authenticated with check (organizer_id = auth.uid());
create policy zones_update on public.zones
  for update to authenticated using (organizer_id = auth.uid());

alter table public.moments add column zone_id uuid references public.zones(id) on delete set null;

-- ————————————————————————— open table —————————————————————————
alter table public.events add column open_table boolean not null default false;

alter table public.invites drop constraint if exists invites_status_check;
alter table public.invites add constraint invites_status_check
  check (status in ('queued', 'sent', 'accepted', 'declined', 'expired', 'cancelled', 'waitlisted', 'requested'));

-- Friends-of-friends feed: open-table events where the viewer knows the
-- host or an accepted attendee, has spots left, and isn't already involved.
create or replace function public.list_open_tables()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  location_name text,
  host_name text,
  spots_left int,
  known_via text
) language sql stable security definer set search_path = public as $$
  with candidate as (
    select e.*, p.display_name as host_name,
      coalesce(e.capacity, 0) - (
        select count(*) from public.invites i
        where i.event_id = e.id and i.status = 'accepted'
      ) as spots_left
    from public.events e
    join public.profiles p on p.id = e.host_id
    where e.open_table
      and e.status in ('inviting', 'confirmed')
      and e.capacity is not null
      and (e.starts_at is null or e.starts_at > now())
      and e.host_id <> auth.uid()
      and not exists (
        select 1 from public.invites i
        where i.event_id = e.id and i.invitee_id = auth.uid()
      )
  )
  select c.id, c.title, c.starts_at, c.location_name, c.host_name,
    c.spots_left::int,
    case
      when public.are_connected(auth.uid(), c.host_id) then c.host_name
      else (
        select pr.display_name from public.invites i
        join public.profiles pr on pr.id = i.invitee_id
        where i.event_id = c.id and i.status = 'accepted'
          and public.are_connected(auth.uid(), i.invitee_id)
        limit 1
      )
    end as known_via
  from candidate c
  where c.spots_left > 0
    and (
      public.are_connected(auth.uid(), c.host_id)
      or exists (
        select 1 from public.invites i
        where i.event_id = c.id and i.status = 'accepted'
          and i.invitee_id is not null
          and public.are_connected(auth.uid(), i.invitee_id)
      )
    );
$$;

create or replace function public.request_to_join(p_event uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_event public.events%rowtype;
  v_id uuid;
  v_pos int;
begin
  select * into v_event from public.events where id = p_event for update;
  if not found or not v_event.open_table then
    raise exception 'event is not open';
  end if;
  if exists (select 1 from public.invites where event_id = p_event and invitee_id = auth.uid()) then
    raise exception 'already involved';
  end if;
  select coalesce(max(position), -1) + 1 into v_pos from public.invites where event_id = p_event;
  insert into public.invites (event_id, invitee_id, position, group_stage, window_minutes, status)
    values (p_event, auth.uid(), v_pos, 999, 1440, 'requested')
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.approve_join_request(p_invite uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted int;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found or v_invite.status <> 'requested' then return 'gone'; end if;
  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.host_id <> auth.uid() then raise exception 'host only'; end if;

  select count(*) into v_accepted from public.invites
    where event_id = v_event.id and status = 'accepted';
  if v_event.capacity is not null and v_accepted >= v_event.capacity then
    update public.invites set status = 'waitlisted', responded_at = now() where id = p_invite;
    return 'waitlisted';
  end if;
  update public.invites set status = 'accepted', responded_at = now() where id = p_invite;
  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
      values (v_event.room_id, v_invite.invitee_id)
      on conflict do nothing;
  end if;
  return 'accepted';
end $$;
