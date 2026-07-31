-- Complete the concrete reliability fixes from the ten-day PR audit and the
-- database-backed Phase 1 items from the two client-feedback roadmaps.

-- ---------------------------------------------------------------------------
-- Reliable schema parity: a single mutable version string can hide a skipped
-- middle migration. Report the actual migration-history gaps instead.
-- ---------------------------------------------------------------------------
create or replace function public.app_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  required_versions constant text[] := array[
    '20260722180000',
    '20260724120000',
    '20260726120000',
    '20260729120000',
    '20260731192027'
  ];
  missing_versions text[];
begin
  select coalesce(array_agg(required.version order by required.version), '{}')
    into missing_versions
    from unnest(required_versions) as required(version)
   where not exists (
     select 1
       from supabase_migrations.schema_migrations applied
      where applied.version = required.version
   );

  return jsonb_build_object(
    'current', '20260731192027',
    'complete', cardinality(missing_versions) = 0,
    'missing', to_jsonb(missing_versions)
  );
end
$$;

revoke all on function public.app_schema_status() from public, anon, authenticated;
grant execute on function public.app_schema_status() to service_role;

-- ---------------------------------------------------------------------------
-- Permanent plan deletion: one database transaction removes the event and its
-- sibling Living Room. Any room failure rolls the event deletion back.
-- ---------------------------------------------------------------------------
create or replace function public.delete_hosted_event_permanently(p_event uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  viewer uuid := (select auth.uid());
  target public.events%rowtype;
begin
  if viewer is null then return 'auth_required'; end if;

  select * into target
    from public.events
   where id = p_event
   for update;

  if not found then return 'not_found'; end if;
  if target.host_id <> viewer then return 'forbidden'; end if;

  if target.status not in ('cancelled', 'past') and exists (
    select 1 from public.invites
     where event_id = target.id and status = 'accepted'
  ) then
    return 'accepted_guests';
  end if;

  delete from public.events where id = target.id;
  if target.room_id is not null then
    delete from public.rooms where id = target.room_id and kind = 'event';
    if not found then
      raise exception 'event room cleanup failed';
    end if;
  end if;

  return 'deleted';
end
$$;

revoke all on function public.delete_hosted_event_permanently(uuid)
  from public, anon, authenticated;
grant execute on function public.delete_hosted_event_permanently(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Relationship-preserving declines: keep the existing categorical reason and
-- add one optional, short sentence for the host.
-- ---------------------------------------------------------------------------
alter table public.invites
  add column if not exists decline_message text;

alter table public.invites
  drop constraint if exists invites_decline_message_length;
alter table public.invites
  add constraint invites_decline_message_length
  check (decline_message is null or char_length(decline_message) <= 280);

-- ---------------------------------------------------------------------------
-- Neighborhood requests/offers: structured kind, expiry, fulfillment, and a
-- private-to-the-board "I can help" response.
-- ---------------------------------------------------------------------------
alter table public.board_posts
  drop constraint if exists board_posts_kind_check;
alter table public.board_posts
  add constraint board_posts_kind_check
  check (kind in ('notice', 'event', 'offer', 'request'));

alter table public.board_posts
  add column if not exists expires_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by uuid references public.profiles(id) on delete set null;

create index if not exists board_posts_active_idx
  on public.board_posts (board_id, created_at desc)
  where fulfilled_at is null;

create table if not exists public.board_post_responses (
  post_id uuid not null references public.board_posts(id) on delete cascade,
  responder_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, responder_id)
);

alter table public.board_post_responses enable row level security;

drop policy if exists board_post_responses_select on public.board_post_responses;
create policy board_post_responses_select
  on public.board_post_responses for select to authenticated
  using (
    exists (
      select 1 from public.board_posts post
       where post.id = post_id
         and public.is_board_member(post.board_id, (select auth.uid()))
    )
  );

drop policy if exists board_post_responses_insert on public.board_post_responses;
create policy board_post_responses_insert
  on public.board_post_responses for insert to authenticated
  with check (
    responder_id = (select auth.uid())
    and exists (
      select 1 from public.board_posts post
       where post.id = post_id
         and post.author_id <> (select auth.uid())
         and post.kind in ('offer', 'request')
         and post.fulfilled_at is null
         and (post.expires_at is null or post.expires_at > now())
         and public.is_board_member(post.board_id, (select auth.uid()))
    )
  );

drop policy if exists board_post_responses_delete on public.board_post_responses;
create policy board_post_responses_delete
  on public.board_post_responses for delete to authenticated
  using (responder_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Rooms become an inbox: cheap read cursor plus indexes for latest activity.
-- ---------------------------------------------------------------------------
alter table public.room_members
  add column if not exists last_read_at timestamptz;

drop policy if exists room_members_update on public.room_members;
create policy room_members_update
  on public.room_members for update to authenticated
  using (member_id = (select auth.uid()))
  with check (member_id = (select auth.uid()));

create index if not exists room_members_member_idx
  on public.room_members (member_id, room_id);
create index if not exists messages_room_latest_idx
  on public.messages (room_id, created_at desc);

-- Keep the legacy version probe for older deployments while the application
-- moves to app_schema_status().
create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260731192027'::text
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
