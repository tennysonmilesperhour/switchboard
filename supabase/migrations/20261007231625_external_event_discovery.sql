-- Salt Lake discovery: public canonical events, private source listings,
-- owner-scoped submissions/preferences, and a service-role collector lease.
create table public.event_sources (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{1,62}$'), name text not null,
  url text not null check (url ~ '^https?://'),
  format text not null default 'auto' check (format in ('auto','html','ics','trumba_json','ticketmaster')),
  enabled boolean not null default true, city text not null default 'Salt Lake City',
  time_zone text not null default 'America/Denver',
  trust_score smallint not null default 70 check (trust_score between 0 and 100),
  stale_after_hours integer not null default 30 check (stale_after_hours between 6 and 720),
  last_started_at timestamptz, last_succeeded_at timestamptz, last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  last_event_count integer, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.external_events (
  id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
  title text not null check (char_length(title) between 1 and 300), description text,
  starts_at timestamptz not null, ends_at timestamptz not null,
  time_zone text not null default 'America/Denver', venue_name text, address text,
  city text not null default 'Salt Lake City', category text, tags text[] not null default '{}',
  image_url text check (image_url is null or image_url ~ '^https?://'),
  canonical_url text not null check (canonical_url ~ '^https?://'),
  ticket_url text check (ticket_url is null or ticket_url ~ '^https?://'),
  price_label text, is_free boolean, age_label text, accessibility text[] not null default '{}',
  active_listing_count integer not null default 0 check (active_listing_count >= 0),
  confidence smallint not null default 0 check (confidence between 0 and 100),
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now(),
  cancelled_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.external_event_listings (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.external_events(id) on delete cascade,
  source_id text not null references public.event_sources(id) on delete cascade, source_event_id text not null,
  content_hash text not null, canonical_url text not null, ticket_url text,
  source_status text not null default 'active' check (source_status in ('active','cancelled','stale')),
  payload jsonb not null default '{}', first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(), last_seen_run uuid not null,
  unique (source_id, source_event_id)
);

create table public.external_event_submissions (
  id uuid primary key default gen_random_uuid(), submitted_by uuid not null references public.profiles(id) on delete cascade,
  url text not null check (url ~ '^https?://'), note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','needs_review','accepted','rejected')),
  review_note text, reviewed_at timestamptz, created_at timestamptz not null default now()
);

create table public.external_event_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.external_events(id) on delete cascade,
  state text not null check (state in ('saved','hidden')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table private.external_event_collection_state (
  singleton boolean primary key default true check (singleton), last_started_at timestamptz,
  last_run_at timestamptz, running_until timestamptz, last_counts jsonb not null default '{}'
);
insert into private.external_event_collection_state (singleton) values (true);

create index external_events_upcoming_idx on public.external_events (starts_at) where cancelled_at is null and active_listing_count > 0;
create index external_events_city_start_idx on public.external_events (city, starts_at) where cancelled_at is null and active_listing_count > 0;
create index external_event_listings_event_idx on public.external_event_listings (event_id);
create index external_event_listings_source_seen_idx on public.external_event_listings (source_id, last_seen_at);
create index external_event_submissions_owner_idx on public.external_event_submissions (submitted_by, created_at desc);

alter table public.event_sources enable row level security;
alter table public.external_events enable row level security;
alter table public.external_event_listings enable row level security;
alter table public.external_event_submissions enable row level security;
alter table public.external_event_preferences enable row level security;
alter table private.external_event_collection_state enable row level security;

revoke all on table public.event_sources from public, anon, authenticated;
revoke all on table public.external_event_listings from public, anon, authenticated;
revoke all on table private.external_event_collection_state from public, anon, authenticated, service_role;
revoke all on table public.external_events from public, anon, authenticated;
grant select (id,title,description,starts_at,ends_at,time_zone,venue_name,address,city,category,tags,image_url,
  canonical_url,ticket_url,price_label,is_free,age_label,accessibility,confidence,last_seen_at)
  on public.external_events to authenticated;
create policy external_events_read_current on public.external_events for select to authenticated
  using (cancelled_at is null and active_listing_count > 0 and ends_at >= now() - interval '6 hours');

grant select, insert on public.external_event_submissions to authenticated;
create policy external_event_submissions_read_own on public.external_event_submissions for select to authenticated
  using ((select auth.uid()) = submitted_by);
create policy external_event_submissions_insert_own on public.external_event_submissions for insert to authenticated
  with check ((select auth.uid()) = submitted_by and status = 'pending' and review_note is null and reviewed_at is null);

grant select, insert, update, delete on public.external_event_preferences to authenticated;
create policy external_event_preferences_read_own on public.external_event_preferences for select to authenticated using ((select auth.uid()) = user_id);
create policy external_event_preferences_insert_own on public.external_event_preferences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy external_event_preferences_update_own on public.external_event_preferences for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy external_event_preferences_delete_own on public.external_event_preferences for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.try_claim_external_event_collection(p_lease_seconds integer default 240)
returns boolean language plpgsql security definer set search_path = pg_catalog, private as $$
declare v_claimed boolean := false;
begin
  if p_lease_seconds < 30 or p_lease_seconds > 300 then raise exception 'invalid event collection lease' using errcode = '22023'; end if;
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('switchboard:external-events',0)) then return false; end if;
  update private.external_event_collection_state set last_started_at=pg_catalog.clock_timestamp(),
    running_until=pg_catalog.clock_timestamp()+p_lease_seconds*interval '1 second'
    where singleton and (running_until is null or running_until <= pg_catalog.clock_timestamp()) returning true into v_claimed;
  return coalesce(v_claimed,false);
end; $$;

create or replace function public.finish_external_event_collection(p_counts jsonb)
returns void language plpgsql security definer set search_path = pg_catalog, private as $$
begin
  if pg_catalog.jsonb_typeof(coalesce(p_counts,'{}'::jsonb)) <> 'object' then raise exception 'counts must be an object' using errcode='22023'; end if;
  update private.external_event_collection_state set last_run_at=pg_catalog.clock_timestamp(), running_until=null,
    last_counts=coalesce(p_counts,'{}'::jsonb) where singleton and running_until is not null;
  if not found then raise exception 'event collection has no active lease' using errcode='55000'; end if;
end; $$;

create or replace function public.refresh_external_event_catalog()
returns integer language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare v_count integer;
begin
  with counts as (
    select event_id,count(*)::integer active_count,max(last_seen_at) newest,max(s.trust_score)::smallint confidence
    from public.external_event_listings l join public.event_sources s on s.id=l.source_id
    where l.source_status='active' group by event_id
  ), merged as (
    select e.id,c.active_count,c.newest,c.confidence from public.external_events e left join counts c on c.event_id=e.id
  )
  update public.external_events e set active_listing_count=coalesce(m.active_count,0), confidence=coalesce(m.confidence,0),
    last_seen_at=coalesce(m.newest,e.last_seen_at), cancelled_at=case when m.active_count is null then coalesce(e.cancelled_at,now()) else null end,
    updated_at=now() from merged m where e.id=m.id;
  get diagnostics v_count=row_count; return v_count;
end; $$;

revoke all on function public.try_claim_external_event_collection(integer) from public,anon,authenticated;
revoke all on function public.finish_external_event_collection(jsonb) from public,anon,authenticated;
revoke all on function public.refresh_external_event_catalog() from public,anon,authenticated;
grant execute on function public.try_claim_external_event_collection(integer) to service_role;
grant execute on function public.finish_external_event_collection(jsonb) to service_role;
grant execute on function public.refresh_external_event_catalog() to service_role;

create or replace function public.external_event_collection_status()
returns table (last_started_at timestamptz,last_run_at timestamptz,running_until timestamptz,last_counts jsonb)
language sql stable security definer set search_path = pg_catalog,private as $$
  select s.last_started_at,s.last_run_at,s.running_until,s.last_counts
  from private.external_event_collection_state s where s.singleton;
$$;
revoke all on function public.external_event_collection_status() from public,anon,authenticated;
grant execute on function public.external_event_collection_status() to service_role;

create or replace function public.list_event_source_health()
returns table (id text,name text,enabled boolean,last_succeeded_at timestamptz,last_error text,
  consecutive_failures integer,last_event_count integer)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_platform_moderator((select auth.uid())) then raise exception 'moderator required' using errcode='42501'; end if;
  return query select s.id,s.name,s.enabled,s.last_succeeded_at,s.last_error,s.consecutive_failures,s.last_event_count
    from public.event_sources s order by s.enabled desc,s.name;
end; $$;

create or replace function public.list_external_event_submissions()
returns table (id uuid,url text,note text,status text,review_note text,created_at timestamptz)
language plpgsql stable security definer set search_path = pg_catalog, public as $$
begin
  if not public.is_platform_moderator((select auth.uid())) then raise exception 'moderator required' using errcode='42501'; end if;
  return query select s.id,s.url,s.note,s.status,s.review_note,s.created_at
    from public.external_event_submissions s where s.status in ('pending','needs_review') order by s.created_at;
end; $$;

revoke all on function public.list_event_source_health() from public,anon;
revoke all on function public.list_external_event_submissions() from public,anon;
grant execute on function public.list_event_source_health() to authenticated;
grant execute on function public.list_external_event_submissions() to authenticated;

insert into public.event_sources (id,name,url,format,enabled,trust_score,stale_after_hours) values
  ('slc-city','Salt Lake City','https://www.slc.gov/events/event-calendar/','html',false,95,48),
  ('salt-lake-county','Salt Lake County','https://www.trumba.com/calendars/slco.json','trumba_json',true,95,30),
  ('visit-salt-lake','Visit Salt Lake','https://www.visitsaltlake.com/events/','html',false,85,48),
  ('slcc','Salt Lake Community College','https://calendar.slcc.edu/','html',true,90,30),
  ('ticketmaster','Ticketmaster','https://app.ticketmaster.com/discovery/v2/events.json?city=Salt%20Lake%20City&stateCode=UT&size=200&sort=date,asc','ticketmaster',false,90,12),
  ('community-submissions','Community submissions','https://switchboard.app','html',false,60,72);
