-- Consent is tied to the verified contact, never inferred from verification.
create table public.sms_preferences (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 phone text not null,
 enabled boolean not null default false,
 plans boolean not null default true,
 reminders boolean not null default true,
 consent_at timestamptz not null default now(),
 consent_source text not null default 'settings',
 policy_version text not null default '2026-09-08',
 updated_at timestamptz not null default now()
);
alter table public.sms_preferences enable row level security;
revoke all on public.sms_preferences from anon, authenticated;
grant select on public.sms_preferences to authenticated;
create policy sms_preferences_read on public.sms_preferences for select to authenticated using (user_id = (select auth.uid()));

create table public.sms_consent_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references public.profiles(id) on delete cascade,
 phone text not null, enabled boolean not null, plans boolean not null, reminders boolean not null,
 recorded_at timestamptz not null default now(),
 source text not null default 'settings', policy_version text not null default '2026-09-08'
);
alter table public.sms_consent_events enable row level security;
revoke all on public.sms_consent_events from anon, authenticated;

create function public.set_sms_preferences(p_enabled boolean, p_plans boolean, p_reminders boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phone text; v_user uuid := auth.uid();
begin
 if v_user is null then raise exception 'Authentication required'; end if;
 if p_enabled is null or p_plans is null or p_reminders is null then raise exception 'Invalid preferences'; end if;
 select normalized_value into v_phone from public.profile_contacts
 where user_id = v_user and kind = 'phone' and verified_at is not null for update;
 if v_phone is null and p_enabled then raise exception 'Verify your current phone number first'; end if;
 if v_phone is null then
   select phone into v_phone from public.sms_preferences where user_id = v_user;
 end if;
 if v_phone is null then return; end if;
 insert into public.sms_preferences(user_id,phone,enabled,plans,reminders)
 values(v_user,v_phone,p_enabled,p_plans,p_reminders)
 on conflict(user_id) do update set phone=excluded.phone,enabled=excluded.enabled,
 plans=excluded.plans,reminders=excluded.reminders,consent_at=now(),updated_at=now();
 insert into public.sms_consent_events(user_id,phone,enabled,plans,reminders)
 values(v_user,v_phone,p_enabled,p_plans,p_reminders);
end $$;
revoke all on function public.set_sms_preferences(boolean,boolean,boolean) from public,anon;
grant execute on function public.set_sms_preferences(boolean,boolean,boolean) to authenticated;

-- Private queue: one job per durable notification, including pending delivery.
create table public.sms_jobs (
 id uuid primary key default gen_random_uuid(),
 invite_id uuid references public.invites(id) on delete cascade,
 notification_id uuid unique references public.notifications(id) on delete cascade,
 user_id uuid references public.profiles(id) on delete cascade,
 phone text not null,
 body text,
 category text not null check(category in ('plans','reminders','verification')),
 status text not null default 'pending' check(status in ('pending','sending','accepted','queued','sending_provider','sent','delivered','undelivered','failed','suppressed','expired','unknown')),
 provider_message_id text unique,
 error_code text,
 attempts integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 available_at timestamptz not null default now(),
 expires_at timestamptz not null default now() + interval '24 hours'
);
alter table public.sms_jobs enable row level security;
revoke all on public.sms_jobs from anon,authenticated;
create index sms_jobs_pending on public.sms_jobs(available_at) where status='pending';

create function public.enqueue_notification_sms() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_category text;
begin
 v_category := case when new.kind='reminder' then 'reminders'
 when new.kind in ('event_invite','event_updated','event_cancelled','event_date_set','announcement') then 'plans' end;
 if v_category is null then return new; end if;
 insert into public.sms_jobs(invite_id,notification_id,user_id,phone,body,category,expires_at)
 select (select i.id from public.invites i where new.kind='event_invite' and i.invitee_id=new.user_id and new.url=case when i.guest_token is not null then '/rsvp/'||i.guest_token else '/events/'||i.event_id end order by i.created_at desc limit 1),new.id,new.user_id,p.phone,
 'Switchboard: ' || left(new.title,100) || E'\n' || left(new.body,220) || E'\n' ||
 case when new.url like '/%' and new.url not like '//%' then new.url else '/notifications' end,
 v_category,now() + case when v_category='reminders' then interval '1 hour' else interval '24 hours' end
 from public.sms_preferences p join public.profile_contacts c
 on c.user_id=p.user_id and c.kind='phone' and c.normalized_value=p.phone and c.verified_at is not null
 where p.user_id=new.user_id and p.enabled and
 ((v_category='plans' and p.plans) or (v_category='reminders' and p.reminders))
 on conflict(notification_id) do nothing;
 return new;
end $$;
revoke all on function public.enqueue_notification_sms() from public,anon,authenticated;
create trigger enqueue_notification_sms after insert on public.notifications
for each row execute function public.enqueue_notification_sms();

create function public.claim_sms_jobs() returns setof public.sms_jobs
language plpgsql security definer set search_path='' as $$
begin
 update public.sms_jobs set status='expired',body=null,updated_at=now() where status='pending' and expires_at<=now();
 -- A killed worker may have sent. Never automatically send that job again.
 update public.sms_jobs set status='unknown',body=null,updated_at=now()
 where status='sending' and updated_at<now()-interval '5 minutes';
 update public.sms_jobs set body=null where body is not null and status not in ('pending','sending');
 delete from public.sms_jobs where created_at<now()-interval '30 days';
 return query with candidates as (
 select j.id from public.sms_jobs j join public.profiles p on p.id=j.user_id
 where j.status='pending' and j.available_at<=now() and j.expires_at>now()
 and not (case when coalesce(p.quiet_hours_start,22) <= coalesce(p.quiet_hours_end,8)
 then extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=p.timezone limit 1),'UTC'))>=coalesce(p.quiet_hours_start,22)
 and extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=p.timezone limit 1),'UTC'))<coalesce(p.quiet_hours_end,8)
 else extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=p.timezone limit 1),'UTC'))>=coalesce(p.quiet_hours_start,22)
 or extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=p.timezone limit 1),'UTC'))<coalesce(p.quiet_hours_end,8) end)
 order by j.available_at for update of j skip locked limit 3
 ) update public.sms_jobs j set status='sending',attempts=attempts+1,updated_at=now()
 from candidates c where j.id=c.id returning j.*;
end $$;
revoke all on function public.claim_sms_jobs() from public,anon,authenticated;
grant execute on function public.claim_sms_jobs() to service_role;
grant all on public.sms_preferences, public.sms_consent_events, public.sms_jobs to service_role;

-- Compare and write in one statement so reordered/concurrent callbacks cannot regress.
create function public.record_sms_status(p_id uuid,p_sid text,p_phone text,p_status text,p_error text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
 if p_status not in ('accepted','queued','sending_provider','sent','failed','undelivered','delivered') then return false; end if;
 update public.sms_jobs set status=p_status,provider_message_id=p_sid,error_code=nullif(p_error,''),body=null,updated_at=now()
 where id=p_id and phone=p_phone and (provider_message_id is null or provider_message_id=p_sid)
 and status in ('sending','unknown','accepted','queued','sending_provider','sent','failed','undelivered')
 and case status when 'sending' then 0 when 'unknown' then 0 when 'accepted' then 1 when 'queued' then 2 when 'sending_provider' then 3 when 'sent' then 4 else 5 end
 < case p_status when 'accepted' then 1 when 'queued' then 2 when 'sending_provider' then 3 when 'sent' then 4 when 'delivered' then 6 else 5 end;
 get diagnostics v_count = row_count;
 return v_count > 0;
end $$;
revoke all on function public.record_sms_status(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_sms_status(uuid,text,text,text,text) to service_role;

-- Match the repository's private-definer/public-invoker convention.
alter function public.enqueue_notification_sms() set schema private;
alter function public.set_sms_preferences(boolean,boolean,boolean) set schema private;
alter function public.claim_sms_jobs() set schema private;
alter function public.record_sms_status(uuid,text,text,text,text) set schema private;
create function public.set_sms_preferences(p_enabled boolean,p_plans boolean,p_reminders boolean)
returns void language sql security invoker set search_path='' as $$select private.set_sms_preferences(p_enabled,p_plans,p_reminders)$$;
create function public.claim_sms_jobs() returns setof public.sms_jobs
language sql security invoker set search_path='' as $$select * from private.claim_sms_jobs()$$;
create function public.record_sms_status(p_id uuid,p_sid text,p_phone text,p_status text,p_error text)
returns boolean language sql security invoker set search_path='' as $$select private.record_sms_status(p_id,p_sid,p_phone,p_status,p_error)$$;
revoke all on function public.set_sms_preferences(boolean,boolean,boolean), public.claim_sms_jobs(), public.record_sms_status(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.set_sms_preferences(boolean,boolean,boolean) to authenticated;
grant execute on function public.claim_sms_jobs(), public.record_sms_status(uuid,text,text,text,text) to service_role;
grant execute on function private.enqueue_notification_sms(), private.set_sms_preferences(boolean,boolean,boolean) to service_role;

-- Probe actual SMS objects, not only migration history.
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
      )
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

-- Keep the legacy scalar probe aligned for older deployments and operator
-- scripts while the structured status is the source of truth.
create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.app_schema_status()->>'current'
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
