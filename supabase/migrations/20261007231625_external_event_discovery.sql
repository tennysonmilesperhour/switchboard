-- Public events discovered outside Switchboard. Collection is service-role only;
-- signed-in readers may browse the normalized catalogue but never mutate it.
create table public.event_sources (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  url text not null,
  format text not null default 'auto' check (format in ('auto', 'html', 'ics', 'trumba_json')),
  enabled boolean not null default true,
  city text not null default 'Salt Lake City',
  last_started_at timestamptz,
  last_succeeded_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.external_events (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.event_sources(id) on delete cascade,
  source_event_id text not null,
  dedupe_key text not null unique,
  title text not null check (char_length(title) between 1 and 300),
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  time_zone text not null default 'America/Denver',
  venue_name text,
  address text,
  city text not null default 'Salt Lake City',
  category text,
  tags text[] not null default '{}',
  image_url text,
  canonical_url text not null,
  ticket_url text,
  price_label text,
  content_hash text not null,
  raw jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  cancelled_at timestamptz,
  unique (source_id, source_event_id)
);

create index external_events_upcoming_idx
  on public.external_events (starts_at)
  where cancelled_at is null;
create index external_events_city_start_idx
  on public.external_events (city, starts_at)
  where cancelled_at is null;

alter table public.event_sources enable row level security;
alter table public.external_events enable row level security;

-- Source health can contain operational errors and is intentionally operator-only.
revoke all on table public.event_sources from anon, authenticated;
revoke insert, update, delete on table public.external_events from anon, authenticated;
grant select on table public.external_events to authenticated;

create policy external_events_read_upcoming
  on public.external_events for select
  to authenticated
  using (cancelled_at is null and ends_at >= now() - interval '6 hours');

insert into public.event_sources (id, name, url, format, enabled) values
  -- The city and tourism calendars render through private front-end APIs. Keep
  -- them in the coverage ledger, but do not pretend the generic parser works.
  ('slc-city', 'Salt Lake City', 'https://www.slc.gov/events/event-calendar/', 'html', false),
  ('salt-lake-county', 'Salt Lake County', 'https://www.trumba.com/calendars/slco.json', 'trumba_json', true),
  ('visit-salt-lake', 'Visit Salt Lake', 'https://www.visitsaltlake.com/events/', 'html', false),
  ('slcc', 'Salt Lake Community College', 'https://calendar.slcc.edu/', 'html', true);
