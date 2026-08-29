-- Connect a calendar, so the availability grid starts from your real week.
--
-- Phase 1 of the calendar work (docs/INNOVATIONS.md #9): a read-only iCalendar
-- subscription rather than OAuth. Every major calendar publishes one — Google's
-- "secret address in iCal format", Outlook's published URL, iCloud's public
-- link — so this works for the whole friend group on day one instead of only
-- the Google half, and it needs no app verification to ship.
--
-- ————————————————————————— the URL is a credential —————————————————————————
--
-- That "secret address" grants read access to the entire calendar to anyone
-- holding it, with no further authentication. It is a bearer token that happens
-- to look like a link, and it is treated as one here: the column is never
-- selected into the client, `calendar_subscription_status()` is the only way the
-- app asks about it, and that function returns whether a calendar is connected
-- and where it points — never the token itself. Rotating is disconnect and
-- reconnect, which is also how the person revokes it at their provider.
--
-- ————————————————————————— what we keep —————————————————————————
--
-- Busy slots, and nothing else. Not titles, not locations, not attendees — the
-- parser drops them before anything is stored (see src/lib/ics-busy.ts), so
-- this table cannot leak what it never held. That keeps the promise the
-- availability grid already makes: the group learns how many people are free,
-- never what any of them is doing. A slot here is the same 6-hour band the grid
-- already uses, so what is stored is coarser than the calendar it came from.

create table if not exists public.calendar_subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  ics_url text not null,
  -- Shown to the person so they can tell which calendar they connected without
  -- the app ever handing back the secret.
  source_host text,
  last_synced_at timestamptz,
  last_status text not null default 'pending'
    check (last_status in ('pending', 'ok', 'unreachable', 'unreadable', 'refused')),
  created_at timestamptz not null default now()
);

alter table public.calendar_subscriptions enable row level security;

-- Own row only, both directions. Nobody may read, write, or point someone
-- else's calendar connection at a feed of their choosing.
drop policy if exists calendar_subscriptions_own on public.calendar_subscriptions;
create policy calendar_subscriptions_own on public.calendar_subscriptions
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- The derived busy bands. Private to their owner: this is the same fact as a
-- row in event_availability, and that table's comment explains at length why
-- "when is this person free" is never readable by anyone else.
create table if not exists public.calendar_busy (
  user_id uuid not null references public.profiles(id) on delete cascade,
  slot timestamptz not null,
  primary key (user_id, slot)
);

alter table public.calendar_busy enable row level security;

drop policy if exists calendar_busy_own on public.calendar_busy;
create policy calendar_busy_own on public.calendar_busy
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- What the app is allowed to know about your connection.
--
-- Security definer with a hard-coded projection, so there is no argument by
-- which it could return `ics_url`. The table's own RLS would already stop
-- another user reading the row; this stops the *owner's own client* receiving a
-- secret it has no use for — the sync runs on the server, so the URL never
-- needs to leave it after the moment it is saved.
create or replace function public.calendar_subscription_status()
returns table (
  connected boolean,
  source_host text,
  last_synced_at timestamptz,
  last_status text
)
language sql stable security definer set search_path = public as $$
  select true, s.source_host, s.last_synced_at, s.last_status
  from public.calendar_subscriptions s
  where s.user_id = auth.uid();
$$;
revoke all on function public.calendar_subscription_status() from public, anon;
grant execute on function public.calendar_subscription_status() to authenticated;

comment on table public.calendar_subscriptions is
  'A person''s read-only calendar feed. ics_url is a bearer credential: never select it into a client — use calendar_subscription_status().';
comment on table public.calendar_busy is
  'Busy bands derived from a connected calendar. Private to their owner, and coarser than the calendar they came from: times only, never titles.';
