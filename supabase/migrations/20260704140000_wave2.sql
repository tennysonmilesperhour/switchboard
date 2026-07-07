-- Switchboard next-wave features: sabbatical mode, co-hosts, split the bill.
-- All additive — new columns and tables only, no changes to existing policies.

-- ————————————————————————— sabbatical mode —————————————————————————
-- One switch to pause outbound signals, radar, and matchmaking. Friends who
-- reach out see a gentle "quiet season" note instead of silence.
alter table public.profiles
  add column if not exists sabbatical boolean not null default false;
alter table public.profiles
  add column if not exists sabbatical_message text;

-- ————————————————————————— co-hosts —————————————————————————
-- Additional people who share host powers for an event. Powers are granted in
-- the server layer via is_event_host(); existing host-only policies are left
-- untouched so nothing about the current permission model changes.
create table public.event_cohosts (
  event_id uuid not null references public.events(id) on delete cascade,
  cohost_id uuid not null references public.profiles(id) on delete cascade,
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, cohost_id)
);
alter table public.event_cohosts enable row level security;

-- The primary host manages the co-host list.
create policy event_cohosts_host on public.event_cohosts for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()))
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
-- A co-host can see their own membership row.
create policy event_cohosts_self_select on public.event_cohosts for select to authenticated
  using (cohost_id = auth.uid());

-- True for the primary host or any co-host of the event.
create or replace function public.is_event_host(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e where e.id = p_event and e.host_id = p_user
  ) or exists (
    select 1 from public.event_cohosts c where c.event_id = p_event and c.cohost_id = p_user
  );
$$;

-- Let co-hosts approve Open Table join requests too (was primary-host only).
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
  if not public.is_event_host(v_event.id, auth.uid()) then raise exception 'host only'; end if;

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

-- ————————————————————————— split the bill —————————————————————————
-- A shared ledger inside a Living Room. No money moves through Switchboard;
-- settling happens via an external Venmo/PayPal link.
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 120),
  amount_cents int not null check (amount_cents > 0),
  payer_id uuid not null references public.profiles(id) on delete cascade,
  settle_url text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index expenses_room_idx on public.expenses (room_id, created_at desc);
alter table public.expenses enable row level security;

create policy expenses_select on public.expenses for select to authenticated
  using (public.is_room_member(room_id, auth.uid()));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (created_by = auth.uid() and public.is_room_member(room_id, auth.uid()));
-- The person who logged it, or the payer, can remove it.
create policy expenses_delete on public.expenses for delete to authenticated
  using (created_by = auth.uid() or payer_id = auth.uid());
