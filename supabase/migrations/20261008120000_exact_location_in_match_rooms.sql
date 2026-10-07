-- Exact location between two people who matched, so they can find each other.
--
-- The live map blurs everyone to a ~110 m cell, which is right for "who is
-- around" and useless for "where in this park are you". Once two people have
-- chosen each other (a match room from Discover or Mutual, or a moment room
-- from a check-in), either of them may share an exact point with the other for
-- a short window. The rules:
--
--   * Two-person rooms only (`match`, `moment`). Never a plan's group room.
--   * Members only, and only while the other person is still a member.
--   * See and be seen: you read the other person's point only while you are
--     sharing yours. Nobody can watch without being watched.
--   * A block closes it both ways (private.room_closed_by_block), as it closes
--     the room's chat. Suspended accounts and sabbaticals are out, as they are
--     on the map.
--   * Time-boxed: 60 minutes from the last time you turned it on, and stopped
--     at once by Stop, by leaving or unmatching (the room cascades), or by
--     silence: a point with no write for 15 minutes is not returned, the same
--     freshness rule as the map (20261006140000).
--
-- The table has RLS on and no policies: every read and write goes through the
-- definer functions below, which re-check all of the above on each call. The
-- write time is stamped by the database, never by the client.

create table public.room_exact_locations (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (room_id, user_id)
);

create index room_exact_locations_user_idx on public.room_exact_locations (user_id);
create index room_exact_locations_expires_idx on public.room_exact_locations (expires_at);

alter table public.room_exact_locations enable row level security;
-- No policies, on purpose: see the header.

-- Who may share or see an exact point in this room right now.
create or replace function private.exact_location_allowed(p_room uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and exists (
      select 1 from public.rooms r
      where r.id = p_room and r.kind in ('match', 'moment')
    )
    and private.is_room_member(p_room, p_user)
    and not private.room_closed_by_block(p_room, p_user)
    and not private.is_suspended(p_user)
    and not exists (
      select 1 from public.profiles p where p.id = p_user and p.sabbatical
    )
    -- Somebody else is still here to share with.
    and exists (
      select 1 from public.room_members other
      where other.room_id = p_room and other.member_id <> p_user
    );
$$;

revoke all on function private.exact_location_allowed(uuid, uuid) from public, anon, authenticated;
grant execute on function private.exact_location_allowed(uuid, uuid) to service_role;

-- Start sharing, or move the caller's point. Returns the status the action
-- reports: 'shared', or the reason it was refused.
create or replace function public.share_exact_location(
  p_room uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m double precision default null,
  p_restart boolean default false
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if p_latitude is null or p_longitude is null
     or p_latitude not between -90 and 90
     or p_longitude not between -180 and 180 then
    return 'invalid';
  end if;
  if not private.exact_location_allowed(p_room, v_user) then
    return 'not_allowed';
  end if;

  -- An exact point outlives its window by no more than the next share
  -- anywhere: expired rows are cleared here, through the expiry index.
  delete from public.room_exact_locations where expires_at <= now();

  if p_restart then
    insert into public.room_exact_locations
      (room_id, user_id, latitude, longitude, accuracy_m, updated_at, expires_at)
    values
      (p_room, v_user, p_latitude, p_longitude,
       case when p_accuracy_m >= 0 then p_accuracy_m end,
       now(), now() + interval '60 minutes')
    on conflict (room_id, user_id) do update
      set latitude = excluded.latitude,
          longitude = excluded.longitude,
          accuracy_m = excluded.accuracy_m,
          updated_at = now(),
          expires_at = excluded.expires_at;
    return 'shared';
  end if;

  -- A position update never starts or extends a share: stopping, or letting
  -- the hour run out, is final until the person turns it on again.
  update public.room_exact_locations
     set latitude = p_latitude,
         longitude = p_longitude,
         accuracy_m = case when p_accuracy_m >= 0 then p_accuracy_m end,
         updated_at = now()
   where room_id = p_room
     and user_id = v_user
     and expires_at > now();
  if not found then
    return 'not_sharing';
  end if;
  return 'shared';
end;
$$;

revoke all on function public.share_exact_location(uuid, double precision, double precision, double precision, boolean)
  from public, anon;
grant execute on function public.share_exact_location(uuid, double precision, double precision, double precision, boolean)
  to authenticated;

create or replace function public.stop_exact_location(p_room uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from public.room_exact_locations
  where room_id = p_room and user_id = auth.uid();
$$;

revoke all on function public.stop_exact_location(uuid) from public, anon;
grant execute on function public.stop_exact_location(uuid) to authenticated;

-- The caller's own share and, only while it is live, the other member's.
create or replace function public.exact_locations_in_room(p_room uuid)
returns table (
  user_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  updated_at timestamptz,
  expires_at timestamptz,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select l.*
    from public.room_exact_locations l
    where l.room_id = p_room
      and l.user_id = auth.uid()
      and l.expires_at > now()
      and private.exact_location_allowed(p_room, auth.uid())
  )
  select me.user_id, me.latitude, me.longitude, me.accuracy_m,
         me.updated_at, me.expires_at, true
  from me
  union all
  select l.user_id, l.latitude, l.longitude, l.accuracy_m,
         l.updated_at, l.expires_at, false
  from public.room_exact_locations l
  cross join me
  where l.room_id = p_room
    and l.user_id <> auth.uid()
    and l.expires_at > now()
    and l.updated_at > now() - interval '15 minutes'
    and private.exact_location_allowed(p_room, l.user_id);
$$;

revoke all on function public.exact_locations_in_room(uuid) from public, anon;
grant execute on function public.exact_locations_in_room(uuid) to authenticated;

-- A sabbatical ends every exact share too (as it ends the live map share in
-- 20261006130000), so nothing lingers if one was on when it started.
create or replace function private.clear_exact_locations_on_sabbatical()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.sabbatical and not coalesce(old.sabbatical, false) then
    delete from public.room_exact_locations where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_exact_locations_on_sabbatical() from public, anon, authenticated;
grant execute on function private.clear_exact_locations_on_sabbatical() to service_role;

drop trigger if exists profiles_clear_exact_locations on public.profiles;
create trigger profiles_clear_exact_locations
  after update of sabbatical on public.profiles
  for each row execute function private.clear_exact_locations_on_sabbatical();

-- Leaving the room ends your share in it.
create or replace function private.clear_exact_location_on_leave()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.room_exact_locations
  where room_id = old.room_id and user_id = old.member_id;
  return old;
end;
$$;

revoke all on function private.clear_exact_location_on_leave() from public, anon, authenticated;
grant execute on function private.clear_exact_location_on_leave() to service_role;

drop trigger if exists room_members_clear_exact_location on public.room_members;
create trigger room_members_clear_exact_location
  after delete on public.room_members
  for each row execute function private.clear_exact_location_on_leave();

-- Schema health knows about all of the above, so a half-applied deploy reads as
-- incomplete. Every existing entry from 20260930092000 is carried unchanged.
create or replace function public.app_schema_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  current_version text;
  missing_objects text[];
begin
  select max(applied.version)
    into current_version
    from supabase_migrations.schema_migrations applied;

  with required_objects(name, present) as (
    values
      ('public.notification_routes', to_regclass('public.notification_routes') is not null),
      (
        'public.notification_routes.sms_fallback_at',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'notification_routes'
             and column_name = 'sms_fallback_at'
        )
      ),
      ('public.dismiss_sms_route_note', to_regprocedure('public.dismiss_sms_route_note()') is not null),
      ('sms_opt_outs.sms_opt_outs_route_fallback', exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass('public.sms_opt_outs') and tgname='sms_opt_outs_route_fallback' and tgenabled <> 'D')),
      ('public.guest_sms_consents', to_regclass('public.guest_sms_consents') is not null),
      ('public.notification_email_jobs', to_regclass('public.notification_email_jobs') is not null),
      ('public.handle_sms_command', to_regprocedure('public.handle_sms_command(text,text,text,text)') is not null),
      ('public.sms_preferences', to_regclass('public.sms_preferences') is not null),
      ('public.sms_consent_events', to_regclass('public.sms_consent_events') is not null),
      ('public.sms_jobs', to_regclass('public.sms_jobs') is not null),
      ('public.set_sms_preferences', to_regprocedure('public.set_sms_preferences(boolean,boolean,boolean)') is not null),
      ('public.claim_sms_jobs', to_regprocedure('public.claim_sms_jobs()') is not null),
      ('public.record_sms_status', to_regprocedure('public.record_sms_status(uuid,text,text,text,text)') is not null),
      ('notifications.enqueue_notification_sms', exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass('public.notifications') and tgname='enqueue_notification_sms' and tgenabled <> 'D')),
      (
        'public.profiles.notify_plans',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'profiles'
             and column_name = 'notify_plans'
        )
      ),
      (
        'public.profiles.appearance_custom',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'profiles'
             and column_name = 'appearance_custom'
        )
      ),
      (
        'public.profiles.digest_hour',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'profiles'
             and column_name = 'digest_hour'
        )
      ),
      (
        'public.calendar_subscriptions',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'calendar_subscriptions'
        )
      ),
      (
        'public.calendar_busy',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'calendar_busy'
        )
      ),
      (
        'public.match_dismissals',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'match_dismissals'
        )
      ),
      (
        'public.event_availability',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'event_availability'
        )
      ),
      (
        'public.parental_approvals',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'parental_approvals'
        )
      ),
      (
        'public.event_availability_responses',
        exists (
          select 1
            from information_schema.tables
           where table_schema = 'public'
             and table_name = 'event_availability_responses'
        )
      ),
      ('public.expense_shares', to_regclass('public.expense_shares') is not null),
      ('public.connection_request_ignores', to_regclass('public.connection_request_ignores') is not null),
      ('public.moderation_actions', to_regclass('public.moderation_actions') is not null),
      ('public.ritual_reminders', to_regclass('public.ritual_reminders') is not null),
      (
        'public.room_members.muted',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'room_members'
             and column_name = 'muted'
        )
      ),
      (
        'public.rituals.due_on',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'rituals'
             and column_name = 'due_on'
        )
      ),
      (
        'public.parental_approvals.email_status',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'parental_approvals'
             and column_name = 'email_status'
        )
      ),
      (
        'public.zone_join_requests.decided_at',
        exists (
          select 1
            from information_schema.columns
           where table_schema = 'public'
             and table_name = 'zone_join_requests'
             and column_name = 'decided_at'
        )
      ),
      ('public.event_invite_list', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'event_invite_list')),
      ('public.save_expense', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'save_expense')),
      ('public.settle_up', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'settle_up')),
      ('public.leave_room', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'leave_room')),
      ('public.my_room_inbox', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'my_room_inbox')),
      ('public.unmatch', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'unmatch')),
      ('public.request_zone_join', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'request_zone_join')),
      ('public.set_board_member_role', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'set_board_member_role')),
      ('public.decline_join_request', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'decline_join_request')),
      ('public.skip_ritual', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'skip_ritual')),
      ('public.claim_ritual_reminders', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'claim_ritual_reminders')),
      ('public.list_suspended_accounts', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'list_suspended_accounts')),
      ('public.room_exact_locations', to_regclass('public.room_exact_locations') is not null),
      ('public.share_exact_location', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'share_exact_location')),
      ('public.stop_exact_location', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'stop_exact_location')),
      ('public.exact_locations_in_room', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'exact_locations_in_room'))
  )
  select coalesce(array_agg(name::text order by name), '{}'::text[])
    into missing_objects
    from required_objects
   where not present;

  return jsonb_build_object(
    'current', current_version,
    'complete', cardinality(missing_objects) = 0,
    'missing', to_jsonb(missing_objects)
  );
end
$$;

revoke all on function public.app_schema_status() from public, anon, authenticated;
grant execute on function public.app_schema_status() to service_role;
