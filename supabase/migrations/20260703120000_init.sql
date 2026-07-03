-- Switchboard v1 — initial schema
-- Anonymity invariants:
--  (1) individual poll votes are never selectable; aggregates only via poll_results()
--  (2) mutual_intents are readable only by their author; matching runs in a
--      security-definer trigger so targets never learn of unrequited interest

-- ————————————————————————— profiles —————————————————————————
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  handle text unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  avatar_url text,
  bio text,
  interests text[] not null default '{}',
  quiet_hours_start int check (quiet_hours_start between 0 and 23),
  quiet_hours_end int check (quiet_hours_end between 0 and 23),
  timezone text not null default 'UTC',
  onboarded boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ————————————————————————— circles —————————————————————————
create table public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '👥',
  created_at timestamptz not null default now()
);

create table public.circle_members (
  circle_id uuid not null references public.circles(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  primary key (circle_id, member_id)
);

-- ————————————————————————— connections —————————————————————————
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create or replace function public.are_connected(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.connections
    where status = 'accepted'
      and ((requester_id = a and addressee_id = b) or (requester_id = b and addressee_id = a))
  );
$$;

-- ————————————————————————— rooms (Digital Living Rooms) —————————————————————————
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'group' check (kind in ('event', 'match', 'group', 'moment')),
  title text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (room_id, member_id)
);

create or replace function public.is_room_member(p_room uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_members where room_id = p_room and member_id = p_user);
$$;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_room_created_idx on public.messages (room_id, created_at desc);

create table public.room_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  kind text not null check (kind in ('event', 'address', 'task', 'link', 'photo', 'note')),
  title text not null,
  detail text,
  url text,
  done boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index room_items_room_kind_idx on public.room_items (room_id, kind);

-- ————————————————————————— events —————————————————————————
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  location_name text,
  location_address text,
  starts_at timestamptz,
  ends_at timestamptz,
  capacity int check (capacity is null or capacity > 0),
  invite_mode text not null default 'individual' check (invite_mode in ('individual', 'group', 'all_at_once')),
  status text not null default 'inviting' check (status in ('draft', 'deciding', 'inviting', 'confirmed', 'cancelled', 'past')),
  show_invite_list boolean not null default false,
  show_accepted boolean not null default true,
  show_expired boolean not null default false,
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  invitee_id uuid references public.profiles(id) on delete cascade,
  guest_name text,
  guest_contact text,
  guest_token uuid unique default gen_random_uuid(),
  position int not null,
  group_stage int not null default 0,
  window_minutes int not null default 1440 check (window_minutes > 0),
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'accepted', 'declined', 'expired', 'cancelled', 'waitlisted')),
  sent_at timestamptz,
  responded_at timestamptz,
  decline_note text check (decline_note in ('keep_asking', 'not_my_thing')),
  created_at timestamptz not null default now(),
  unique (event_id, position),
  check (invitee_id is not null or guest_name is not null)
);
create index invites_event_idx on public.invites (event_id);
create index invites_invitee_idx on public.invites (invitee_id) where invitee_id is not null;
create index invites_pending_idx on public.invites (status, sent_at) where status = 'sent';

create or replace function public.can_view_event(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e where e.id = p_event and e.host_id = p_user
  ) or exists (
    -- queued invitees must NOT see the event: they haven't been invited yet
    select 1 from public.invites i
    where i.event_id = p_event and i.invitee_id = p_user and i.status <> 'queued'
  );
$$;

-- Atomic accept: capacity check + status flip under a row lock. Cascade
-- advancement itself lives in the TS engine (single source of truth).
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean, p_note text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted int;
  v_cap int;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.invitee_id is distinct from auth.uid() then
    raise exception 'not your invite';
  end if;
  if v_invite.status <> 'sent' then
    return v_invite.status; -- window already closed or already answered
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;

  if not p_accept then
    update public.invites
      set status = 'declined', responded_at = now(), decline_note = p_note
      where id = p_invite;
    return 'declined';
  end if;

  select count(*) into v_accepted from public.invites
    where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(v_event.capacity, case when v_event.invite_mode = 'individual' then 1 else null end);

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites set status = 'waitlisted', responded_at = now() where id = p_invite;
    return 'waitlisted';
  end if;

  update public.invites set status = 'accepted', responded_at = now() where id = p_invite;
  return 'accepted';
end $$;

-- ————————————————————————— polls (Anonymous Weighted Input) —————————————————————————
create table public.polls (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  phase text not null default 'suggesting' check (phase in ('suggesting', 'voting', 'runoff', 'decided')),
  resolution text not null default 'host_pick' check (resolution in ('host_pick', 'auto', 'runoff')),
  allow_suggestions boolean not null default true,
  suggest_deadline timestamptz,
  vote_deadline timestamptz,
  winning_option_id uuid,
  created_at timestamptz not null default now()
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  detail text,
  source text not null default 'guests' check (source in ('guests', 'host', 'ai')),
  created_at timestamptz not null default now()
);

alter table public.polls
  add constraint polls_winning_option_fk
  foreign key (winning_option_id) references public.poll_options(id) on delete set null;

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  weight int not null check (weight in (-1, 0, 1, 2)),
  updated_at timestamptz not null default now(),
  primary key (option_id, voter_id)
);

-- Anonymity invariant (1): aggregates only, never raw votes.
create or replace function public.poll_results(p_poll uuid)
returns table (
  option_id uuid,
  score bigint,
  loves bigint,
  objections bigint,
  voters bigint
) language sql stable security definer set search_path = public as $$
  select
    o.id,
    coalesce(sum(v.weight), 0)::bigint,
    count(*) filter (where v.weight = 2),
    count(*) filter (where v.weight = -1),
    count(v.voter_id)
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  where o.poll_id = p_poll
    and public.can_view_event((select event_id from public.polls where id = p_poll), auth.uid())
  group by o.id;
$$;

-- ————————————————————————— mutual mode —————————————————————————
create table public.mutual_intents (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  activity text not null,
  kind text not null default 'down_to_connect' check (kind in ('down_to_connect', 'open_to_reschedule')),
  event_id uuid references public.events(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'matched', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (author_id, target_id, activity, kind),
  check (author_id <> target_id)
);
create index mutual_intents_pair_idx on public.mutual_intents (target_id, author_id, activity, kind) where status = 'active';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles(id) on delete cascade,
  user_b uuid not null references public.profiles(id) on delete cascade,
  activity text not null,
  kind text not null default 'down_to_connect',
  event_id uuid references public.events(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  created_at timestamptz not null default now()
);
create index matches_users_idx on public.matches (user_a, user_b);

-- Anonymity invariant (2): matching happens here, inside the database,
-- so an unrequited intent is never observable by its target.
create or replace function public.check_mutual_match()
returns trigger language plpgsql security definer set search_path = public as $$
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
      and (kind = 'down_to_connect' or event_id is not distinct from new.event_id)
    limit 1
    for update;

  if found then
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

create trigger on_mutual_intent_created
  after insert or update of status on public.mutual_intents
  for each row
  when (new.status = 'active')
  execute function public.check_mutual_match();

-- ————————————————————————— availability signals —————————————————————————
create table public.availability_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null,
  label text not null,
  circle_id uuid references public.circles(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index signals_user_idx on public.availability_signals (user_id, expires_at);

-- ————————————————————————— shared moments —————————————————————————
create table public.moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  place_name text not null,
  experiences text[] not null default '{}',
  headline text,
  available_until timestamptz not null,
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  created_at timestamptz not null default now()
);
create index moments_place_idx on public.moments (lower(place_name)) where status = 'open';

create table public.moment_interests (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  other_moment_id uuid not null references public.moments(id) on delete cascade,
  stage text not null default 'curious' check (stage in ('curious', 'revealed', 'accepted', 'passed')),
  created_at timestamptz not null default now(),
  unique (moment_id, other_moment_id)
);

-- ————————————————————————— push subscriptions —————————————————————————
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ————————————————————————— row level security —————————————————————————
alter table public.profiles enable row level security;
alter table public.circles enable row level security;
alter table public.circle_members enable row level security;
alter table public.connections enable row level security;
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.messages enable row level security;
alter table public.room_items enable row level security;
alter table public.events enable row level security;
alter table public.invites enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.mutual_intents enable row level security;
alter table public.matches enable row level security;
alter table public.availability_signals enable row level security;
alter table public.moments enable row level security;
alter table public.moment_interests enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles: readable by any signed-in user (people search); self-managed
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid());

-- circles: owner-only
create policy circles_all on public.circles for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy circle_members_owner on public.circle_members for all to authenticated
  using (exists (select 1 from public.circles c where c.id = circle_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.circles c where c.id = circle_id and c.owner_id = auth.uid()));

-- connections: participants only
create policy connections_select on public.connections for select to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());
create policy connections_insert on public.connections for insert to authenticated
  with check (requester_id = auth.uid());
create policy connections_update on public.connections for update to authenticated
  using (addressee_id = auth.uid());
create policy connections_delete on public.connections for delete to authenticated
  using (requester_id = auth.uid() or addressee_id = auth.uid());

-- rooms: members only
create policy rooms_select on public.rooms for select to authenticated
  using (public.is_room_member(id, auth.uid()));
create policy rooms_insert on public.rooms for insert to authenticated
  with check (created_by = auth.uid());
create policy room_members_select on public.room_members for select to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy room_members_insert on public.room_members for insert to authenticated
  with check (
    exists (select 1 from public.rooms r where r.id = room_id and r.created_by = auth.uid())
    or member_id = auth.uid()
  );
create policy messages_select on public.messages for select to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_room_member(room_id, auth.uid()));
create policy room_items_select on public.room_items for select to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy room_items_write on public.room_items for insert to authenticated
  with check (public.is_room_member(room_id, auth.uid()));
create policy room_items_update on public.room_items for update to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy room_items_delete on public.room_items for delete to authenticated
  using (public.is_room_member(room_id, auth.uid()));

-- events: host, or invitee whose invite has actually been sent
create policy events_select on public.events for select to authenticated
  using (public.can_view_event(id, auth.uid()));
create policy events_insert on public.events for insert to authenticated
  with check (host_id = auth.uid());
create policy events_update on public.events for update to authenticated
  using (host_id = auth.uid());
create policy events_delete on public.events for delete to authenticated
  using (host_id = auth.uid());

-- invites: host sees all; invitee sees own once sent (never while queued).
-- All status transitions run through security-definer functions / service role.
create policy invites_select on public.invites for select to authenticated
  using (
    exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid())
    or (invitee_id = auth.uid() and status <> 'queued')
  );
create policy invites_insert on public.invites for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
create policy invites_delete on public.invites for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- polls follow event visibility
create policy polls_select on public.polls for select to authenticated
  using (public.can_view_event(event_id, auth.uid()));
create policy polls_insert on public.polls for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
create policy polls_update on public.polls for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
create policy poll_options_select on public.poll_options for select to authenticated
  using (public.can_view_event((select event_id from public.polls p where p.id = poll_id), auth.uid()));
create policy poll_options_insert on public.poll_options for insert to authenticated
  with check (public.can_view_event((select event_id from public.polls p where p.id = poll_id), auth.uid()));

-- poll_votes: anonymity invariant (1) — you may only ever see YOUR OWN votes
create policy poll_votes_own_select on public.poll_votes for select to authenticated
  using (voter_id = auth.uid());
create policy poll_votes_own_insert on public.poll_votes for insert to authenticated
  with check (
    voter_id = auth.uid()
    and public.can_view_event((select event_id from public.polls p where p.id = poll_id), auth.uid())
  );
create policy poll_votes_own_update on public.poll_votes for update to authenticated
  using (voter_id = auth.uid());
create policy poll_votes_own_delete on public.poll_votes for delete to authenticated
  using (voter_id = auth.uid());

-- mutual_intents: anonymity invariant (2) — author-only, always
create policy mutual_intents_own on public.mutual_intents for all to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create policy matches_select on public.matches for select to authenticated
  using (user_a = auth.uid() or user_b = auth.uid());

-- availability signals: owner manages; connections in the right circle can see
create policy signals_own on public.availability_signals for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy signals_visible on public.availability_signals for select to authenticated
  using (
    user_id <> auth.uid()
    and expires_at > now()
    and public.are_connected(user_id, auth.uid())
    and (
      circle_id is null
      or exists (select 1 from public.circle_members cm where cm.circle_id = circle_id and cm.member_id = auth.uid())
    )
  );

-- moments: owner-only via RLS; discovery goes through find_shared_moments()
create policy moments_own on public.moments for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy moment_interests_own on public.moment_interests for select to authenticated
  using (exists (select 1 from public.moments m where m.id = moment_id and m.user_id = auth.uid()));

-- push subscriptions: owner only
create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Shared Moments discovery: anonymized candidates at the same place.
-- Requires the caller to have their own open moment there (mutual exposure).
create or replace function public.find_shared_moments(p_place text)
returns table (id uuid, experiences text[], headline text)
language sql stable security definer set search_path = public as $$
  select m.id, m.experiences, m.headline
  from public.moments m
  where lower(m.place_name) = lower(p_place)
    and m.status = 'open'
    and m.available_until > now()
    and m.user_id <> auth.uid()
    and exists (
      select 1 from public.moments mine
      where mine.user_id = auth.uid()
        and lower(mine.place_name) = lower(p_place)
        and mine.status = 'open'
        and mine.available_until > now()
    );
$$;

-- ————————————————————————— realtime —————————————————————————
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.invites;
