-- Recipient-owned routing. Existing behavior is retained until explicitly changed.
create table public.notification_routes (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 plans text not null default 'existing' check(plans in ('existing','push','sms','email','in_app')),
 reminders text not null default 'existing' check(reminders in ('existing','push','sms','email','in_app'))
);
alter table public.notification_routes enable row level security;
revoke all on public.notification_routes from anon,authenticated;
grant select on public.notification_routes to authenticated;
grant all on public.notification_routes to service_role;
create policy notification_routes_read on public.notification_routes for select to authenticated using(user_id=(select auth.uid()));

alter table public.sms_consent_events add column urgent_changes boolean not null default false;
alter table public.sms_preferences add column urgent_changes boolean not null default false;
alter table public.notifications add column urgent_until timestamptz;
alter table public.sms_jobs add column urgent_until timestamptz;
alter table public.sms_jobs add column reply_code text not null default upper(substr(replace(gen_random_uuid()::text,'-',''),1,12));
create unique index sms_jobs_reply_code on public.sms_jobs(reply_code);

create function private.set_notification_routes(p_plans text,p_reminders text,p_urgent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_plans is null or p_reminders is null or p_urgent is null or
 p_plans not in ('existing','push','sms','email','in_app') or p_reminders not in ('existing','push','sms','email','in_app') then raise exception 'Invalid preferences'; end if;
 if (p_plans='email' or p_reminders='email') and not exists(select 1 from public.profile_contacts where user_id=auth.uid() and kind='email' and verified_at is not null) then raise exception 'Verify your email first'; end if;
 if (p_plans='sms' or p_reminders='sms' or p_urgent) and not exists(select 1 from public.sms_preferences p join public.profile_contacts c on c.user_id=p.user_id and c.kind='phone' and c.normalized_value=p.phone and c.verified_at is not null where p.user_id=auth.uid() and p.enabled) then raise exception 'Enable SMS first'; end if;
 insert into public.notification_routes(user_id,plans,reminders) values(auth.uid(),p_plans,p_reminders)
 on conflict(user_id) do update set plans=excluded.plans,reminders=excluded.reminders;
 update public.sms_preferences set plans=case when p_plans='sms' then true else plans end,reminders=case when p_reminders='sms' then true else reminders end,urgent_changes=p_urgent,updated_at=now() where user_id=auth.uid();
 insert into public.sms_consent_events(user_id,phone,enabled,plans,reminders,urgent_changes,source,policy_version) select user_id,phone,enabled,plans,reminders,urgent_changes,'notification_routes','2026-09-09' from public.sms_preferences where user_id=auth.uid();
end $$;
create function public.set_notification_routes(p_plans text,p_reminders text,p_urgent boolean)
returns void language sql security invoker set search_path='' as $$select private.set_notification_routes(p_plans,p_reminders,p_urgent)$$;
revoke all on function private.set_notification_routes(text,text,boolean),public.set_notification_routes(text,text,boolean) from public,anon,authenticated;
grant execute on function private.set_notification_routes(text,text,boolean),public.set_notification_routes(text,text,boolean) to authenticated,service_role;

-- Email is a single, explicit alternative to SMS/push. Claims are at-most-once;
-- ambiguous provider results never trigger an automatic duplicate.
create table public.notification_email_jobs (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid unique not null references public.notifications(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 email text not null, category text not null check(category in ('plans','reminders')),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','suppressed','expired','unknown')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),expires_at timestamptz not null
);
alter table public.notification_email_jobs enable row level security;
revoke all on public.notification_email_jobs from anon,authenticated;
grant all on public.notification_email_jobs to service_role;
create index notification_email_jobs_pending on public.notification_email_jobs(created_at) where status='pending';

create function private.enqueue_notification_email() returns trigger language plpgsql security definer set search_path='' as $$
declare v_category text;
begin
 v_category := case when new.kind='reminder' then 'reminders' when new.kind in ('event_invite','event_updated','event_urgent_change','event_cancelled','event_date_set','announcement','rsvp_accepted','rsvp_declined_note','join_request','join_approved','board_response','poll_opened') then 'plans' end;
 if v_category is null then return new; end if;
 insert into public.notification_email_jobs(notification_id,user_id,email,category,expires_at)
 select new.id,new.user_id,c.normalized_value,v_category,now()+case when v_category='reminders' then interval '1 hour' else interval '24 hours' end
 from public.notification_routes r join public.profile_contacts c on c.user_id=r.user_id and c.kind='email' and c.verified_at is not null
 where r.user_id=new.user_id and case v_category when 'plans' then r.plans else r.reminders end='email';
 return new;
end $$;
revoke all on function private.enqueue_notification_email() from public,anon,authenticated;
create trigger enqueue_notification_email after insert on public.notifications for each row execute function private.enqueue_notification_email();

create function private.claim_notification_emails() returns setof public.notification_email_jobs language plpgsql security definer set search_path='' as $$
begin
 update public.notification_email_jobs set status='expired' where status='pending' and expires_at<=now();
 update public.notification_email_jobs set status='unknown' where status='sending' and updated_at<now()-interval '5 minutes';
 delete from public.notification_email_jobs where created_at<now()-interval '30 days';
 return query with candidates as (select id from public.notification_email_jobs where status='pending' and expires_at>now() order by created_at for update skip locked limit 3)
 update public.notification_email_jobs j set status='sending',updated_at=now() from candidates c where j.id=c.id returning j.*;
end $$;
create function public.claim_notification_emails() returns setof public.notification_email_jobs language sql security invoker set search_path='' as $$select * from private.claim_notification_emails()$$;
revoke all on function private.claim_notification_emails(),public.claim_notification_emails() from public,anon,authenticated;
grant execute on function private.claim_notification_emails(),public.claim_notification_emails() to service_role;

-- The guest initiates JOIN from the invitation on their own phone. No host can
-- subscribe a number. Consent is short-lived and scoped to one unclaimed invite.
create table public.guest_sms_consents (
 invite_id uuid primary key references public.invites(id) on delete cascade,
 phone text not null, consent_at timestamptz not null default now(),
 expires_at timestamptz not null, source text not null default 'inbound_join', policy_version text not null default '2026-09-09'
);
alter table public.guest_sms_consents enable row level security;
revoke all on public.guest_sms_consents from anon,authenticated;
grant all on public.guest_sms_consents to service_role;
create table public.sms_inbound_receipts (
 sid text primary key, created_at timestamptz not null default now()
);
alter table public.sms_inbound_receipts enable row level security;
revoke all on public.sms_inbound_receipts from anon,authenticated;
grant all on public.sms_inbound_receipts to service_role;

create function private.handle_sms_command(p_phone text,p_command text,p_code text,p_sid text)
returns text language plpgsql security definer set search_path='' as $$
declare j public.sms_jobs%rowtype; i public.invites%rowtype; e public.events%rowtype; v_outcome text; v_count integer;
begin
 if p_phone !~ '^\+[1-9][0-9]{7,14}$' or p_sid !~ '^SM[0-9a-fA-F]{32}$' then return ''; end if;
 if p_command not in ('JOIN','YES','NO','CONFIRM','UNKNOWN') then return ''; end if;
 insert into public.sms_inbound_receipts(sid) values(p_sid) on conflict do nothing;
 get diagnostics v_count=row_count;
 if v_count=0 then return ''; end if;
 if exists(select 1 from public.sms_opt_outs where normalized_number=p_phone) then return ''; end if;
 if p_command='UNKNOWN' then return 'To RSVP, reply YES or NO followed by the code in your invitation text. Use CONFIRM plus its code to confirm attendance. Open the plan for other requests. Reply STOP to stop texts or HELP for help.'; end if;
 if p_command='JOIN' then
  if p_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'Open your invitation to subscribe to its texts.'; end if;
  select * into i from public.invites where guest_token=p_code::uuid for update;
  if not found or i.invitee_id is not null or i.status not in ('sent','accepted') then return 'Open your invitation to manage notifications. SB-SMS-REPLY'; end if;
  select * into e from public.events where id=i.event_id;
  if e.status not in ('inviting','confirmed','deciding') or (e.starts_at is not null and e.starts_at<=now()) then return 'This invitation is no longer taking text subscriptions. SB-SMS-REPLY'; end if;
  -- A forwarded invitation cannot replace an earlier subscriber's number.
  if exists(select 1 from public.guest_sms_consents where invite_id=i.id and phone<>p_phone and expires_at>now()) then return 'This invitation already has a text subscriber. Ask your host for your own invitation. SB-SMS-REPLY'; end if;
  insert into public.guest_sms_consents(invite_id,phone,expires_at) values(i.id,p_phone,least(coalesce(e.ends_at,e.starts_at+interval '6 hours',now()+interval '30 days'),now()+interval '30 days'))
  on conflict(invite_id) do update set consent_at=now(),expires_at=excluded.expires_at,phone=excluded.phone;
  return 'Subscribed to texts for this invitation only. No account was created. Sign in through your invitation to RSVP. Reply STOP to stop all texts or HELP for help. Msg & data rates may apply.';
 end if;
 select * into j from public.sms_jobs where reply_code=upper(p_code) and phone=p_phone and user_id is not null and invite_id is not null and expires_at>now() and status in ('sending','accepted','queued','sending_provider','sent','delivered','unknown');
 if not found then return 'That reply code is unavailable. Open the plan to respond. SB-SMS-REPLY'; end if;
 if not exists(select 1 from public.profile_contacts c join public.sms_preferences s on s.user_id=c.user_id and s.phone=c.normalized_value where c.user_id=j.user_id and c.kind='phone' and c.normalized_value=p_phone and c.verified_at is not null and s.enabled) then return 'Verify your current phone in Settings, then open the plan to respond. SB-SMS-REPLY'; end if;
 select * into i from public.invites where id=j.invite_id and invitee_id=j.user_id for update;
 if not found then return 'Open the plan to respond. SB-SMS-REPLY'; end if;
 select * into e from public.events where id=i.event_id for update;
 if e.status not in ('inviting','confirmed','deciding') or (e.starts_at is not null and e.starts_at<=now()) or public.are_blocked(e.host_id,j.user_id) then return 'This plan is no longer taking text replies. Open the plan for details. SB-SMS-REPLY'; end if;
 if e.parental_approval or exists(select 1 from public.event_questions where event_id=e.id and required) then return 'This plan needs additional details. Open it to finish your RSVP. SB-SMS-REPLY'; end if;
 if i.status='accepted' and p_command in ('YES','CONFIRM') then return 'You are confirmed as attending. Your host can see your RSVP.'; end if;
 if p_command='CONFIRM' or i.status<>'sent' then return 'Open the plan to view or change your RSVP. SB-SMS-REPLY'; end if;
 -- Reuse the same event lock, capacity and room-membership transition as web RSVP.
 v_outcome := public.respond_to_guest_invite(i.guest_token,p_command='YES');
 if v_outcome='accepted' then
  insert into public.notifications(user_id,kind,title,body,url) values(e.host_id,'rsvp_accepted','Someone is in','An invitation to '||left(e.title,100)||' was accepted by text.','/events/'||e.id);
  return 'You are in! Your host can see your RSVP.';
 elsif v_outcome='waitlisted' then return 'The plan is full. You are on the waitlist; this is not a confirmed place.';
 elsif v_outcome='declined' then return 'Your decline is saved. Your host can see your RSVP.';
 end if;
 return 'Open the plan to respond. SB-SMS-REPLY';
end $$;
create function public.handle_sms_command(p_phone text,p_command text,p_code text,p_sid text)
returns text language sql security invoker set search_path='' as $$select private.handle_sms_command(p_phone,p_command,p_code,p_sid)$$;
revoke all on function private.handle_sms_command(text,text,text,text),public.handle_sms_command(text,text,text,text) from public,anon,authenticated;
grant execute on function private.handle_sms_command(text,text,text,text),public.handle_sms_command(text,text,text,text) to service_role;

create or replace function private.enqueue_notification_sms() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_category text;
begin
 v_category := case when new.kind='reminder' then 'reminders'
 when new.kind in ('event_invite','event_updated','event_urgent_change','event_cancelled','event_date_set','announcement','rsvp_accepted','rsvp_declined_note','join_request','join_approved','board_response','poll_opened') then 'plans' end;
 if v_category is null then return new; end if;
 insert into public.sms_jobs(invite_id,notification_id,user_id,phone,body,category,expires_at,urgent_until)
 select (select i.id from public.invites i where new.kind in ('event_invite','reminder') and i.invitee_id=new.user_id and new.url in ('/rsvp/'||i.guest_token,'/events/'||i.event_id) order by i.created_at desc limit 1),new.id,new.user_id,p.phone,
 'Switchboard: ' || left(new.title,100) || E'\n' || left(new.body,220) || E'\n' ||
 case when new.url like '/%' and new.url not like '//%' then new.url else '/notifications' end,
 v_category,now() + case when v_category='reminders' then interval '1 hour' else interval '24 hours' end, case when new.kind='event_urgent_change' and new.urgent_until is not null then least(new.urgent_until,now()+interval '2 hours') end
 from public.sms_preferences p join public.profile_contacts c
 on c.user_id=p.user_id and c.kind='phone' and c.normalized_value=p.phone and c.verified_at is not null
 where p.user_id=new.user_id and p.enabled and coalesce((select case v_category when 'plans' then r.plans else r.reminders end from public.notification_routes r where r.user_id=p.user_id),'existing') in ('existing','sms') and
 ((v_category='plans' and p.plans) or (v_category='reminders' and p.reminders))
 on conflict(notification_id) do nothing;
 return new;
end $$;

create or replace function private.claim_sms_jobs() returns setof public.sms_jobs
language plpgsql security definer set search_path='' as $$
begin
 update public.sms_jobs set status='expired',body=null,updated_at=now() where status='pending' and expires_at<=now();
 -- A killed worker may have sent. Never automatically send that job again.
 update public.sms_jobs set status='unknown',body=null,updated_at=now()
 where status='sending' and updated_at<now()-interval '5 minutes';
 update public.sms_jobs set body=null where body is not null and status not in ('pending','sending');
 delete from public.sms_jobs where created_at<now()-interval '30 days';
 delete from public.sms_inbound_receipts where created_at<now()-interval '30 days';
 delete from public.guest_sms_consents where expires_at<now()-interval '30 days';
 return query with candidates as (
 select j.id from public.sms_jobs j left join public.profiles p on p.id=j.user_id left join public.guest_sms_consents g on g.invite_id=j.invite_id left join public.invites gi on gi.id=g.invite_id left join public.events ge on ge.id=gi.event_id
 where j.status='pending' and j.available_at<=now() and j.expires_at>now()
 and (j.user_id is not null or (g.phone=j.phone and g.expires_at>now() and gi.invitee_id is null))
 and ((j.urgent_until>now() and exists(select 1 from public.sms_preferences s where s.user_id=j.user_id and s.urgent_changes)) or not (case when coalesce(p.quiet_hours_start,22) <= coalesce(p.quiet_hours_end,8)
 then extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=coalesce(p.timezone,ge.time_zone) limit 1),'UTC'))>=coalesce(p.quiet_hours_start,22)
 and extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=coalesce(p.timezone,ge.time_zone) limit 1),'UTC'))<coalesce(p.quiet_hours_end,8)
 else extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=coalesce(p.timezone,ge.time_zone) limit 1),'UTC'))>=coalesce(p.quiet_hours_start,22)
 or extract(hour from now() at time zone coalesce((select name from pg_catalog.pg_timezone_names where name=coalesce(p.timezone,ge.time_zone) limit 1),'UTC'))<coalesce(p.quiet_hours_end,8) end))
 order by j.available_at for update of j skip locked limit 3
 ) update public.sms_jobs j set status='sending',attempts=attempts+1,updated_at=now()
 from candidates c where j.id=c.id returning j.*;
end $$;

create function private.guest_sms_allowed(p_invite uuid,p_phone text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.guest_sms_consents g join public.invites i on i.id=g.invite_id join public.events e on e.id=i.event_id
 where g.invite_id=p_invite and g.phone=p_phone and g.expires_at>now() and i.invitee_id is null and (i.status in ('sent','accepted') or (i.status='cancelled' and e.status='cancelled'))
 and e.status in ('inviting','confirmed','deciding','cancelled'))
$$;
create function public.guest_sms_allowed(p_invite uuid,p_phone text) returns boolean language sql stable security invoker set search_path='' as $$select private.guest_sms_allowed(p_invite,p_phone)$$;
revoke all on function private.guest_sms_allowed(uuid,text),public.guest_sms_allowed(uuid,text) from public,anon,authenticated;
grant execute on function private.guest_sms_allowed(uuid,text),public.guest_sms_allowed(uuid,text) to service_role;

-- Queue guest logistics and the existing reminder windows from event changes.
-- The phone comes only from guest-initiated consent, never host contact text.
create function private.enqueue_guest_sms() returns trigger language plpgsql security definer set search_path='' as $$
declare v_body text; v_category text := 'plans';
begin
 if new.status='cancelled' and old.status is distinct from new.status then v_body := 'This plan has been cancelled.';
 elsif (old.starts_at,old.location_name,old.location_address) is distinct from (new.starts_at,new.location_name,new.location_address) then v_body := 'The time or place changed. Open your invitation for the latest details.';
 elsif old.reminded_day_before_at is null and new.reminded_day_before_at is not null then v_body := 'This plan is coming up. Open your invitation for the time and place.'; v_category:='reminders';
 elsif old.reminded_soon_at is null and new.reminded_soon_at is not null then v_body := 'This plan starts soon. Open your invitation for the time and place.'; v_category:='reminders';
 else return new; end if;
 insert into public.sms_jobs(invite_id,phone,body,category,expires_at)
 select i.id,g.phone,'Switchboard: '||left(new.title,100)||E'\n'||v_body||E'\n/rsvp/'||i.guest_token,v_category,
 least(g.expires_at,now()+case when v_category='reminders' then interval '1 hour' else interval '24 hours' end)
 from public.invites i join public.guest_sms_consents g on g.invite_id=i.id
 where i.event_id=new.id and i.invitee_id is null and i.status in ('sent','accepted') and g.expires_at>now()
 and (new.status='cancelled' or new.status in ('inviting','confirmed','deciding'));
 return new;
end $$;
revoke all on function private.enqueue_guest_sms() from public,anon,authenticated;
create trigger enqueue_guest_sms after update on public.events for each row execute function private.enqueue_guest_sms();

grant execute on function private.enqueue_guest_sms(),private.enqueue_notification_email() to service_role;

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


-- Share the canonical answerable event states for direct guest and SMS replies.
create or replace function private.respond_to_guest_invite(
  p_token uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted integer;
  v_cap integer;
begin
  select * into v_invite
    from public.invites
   where guest_token = p_token
   for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.status <> 'sent' then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status not in ('inviting','confirmed','deciding') then
    return v_invite.status;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now()
     where id = v_invite.id;
    return 'declined';
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites
       set status = 'waitlisted', responded_at = now()
     where id = v_invite.id;
    return 'waitlisted';
  end if;

  update public.invites
     set status = 'accepted', responded_at = now()
   where id = v_invite.id;

  -- Unregistered guests remain token-only. Once a guest invite has been claimed
  -- by an account, accepting it grants the same room access as a direct invite.
  if v_event.room_id is not null and v_invite.invitee_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;


create or replace function public.respond_to_guest_invite(p_token uuid,p_accept boolean)
returns text language sql security invoker set search_path='' as $$select private.respond_to_guest_invite(p_token,p_accept)$$;
revoke all on function public.respond_to_guest_invite(uuid,boolean),private.respond_to_guest_invite(uuid,boolean) from public,anon,authenticated;
grant execute on function public.respond_to_guest_invite(uuid,boolean),private.respond_to_guest_invite(uuid,boolean) to service_role;
