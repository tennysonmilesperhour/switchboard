-- An "SMS only" route falls back to existing behaviour when texts stop being
-- deliverable (completion plan G9, decision D15).
--
-- Choosing SMS for plan alerts or reminders turns the push for that category
-- off (src/lib/server/notify.ts) and suppresses the legacy email. That is the
-- point of choosing one channel. But the SMS queue only enqueues while the
-- subscription is `enabled`, the category is ticked, the verified contact
-- still matches the subscribed phone, and the number has not texted STOP. The
-- route never noticed any of those changing, so turning SMS off, unticking the
-- plans box, texting STOP, or changing phone number left a person who had
-- asked for "SMS only" with nothing at all: no text, no push, no email. The
-- in-app inbox kept the rows, but nothing told them to look.
--
-- Now every one of those transitions re-checks deliverability and puts an
-- undeliverable SMS route back to 'existing', recording when and why so
-- Settings can say what happened. The route is never switched *to* SMS
-- automatically: START, re-verifying or re-ticking restores the possibility,
-- and the person chooses again.

alter table public.notification_routes
  add column sms_fallback_at timestamptz,
  add column sms_fallback_reason text
    constraint notification_routes_sms_fallback_reason_check
    check (sms_fallback_reason in ('sms_off', 'category_off', 'stopped', 'phone_changed'));

comment on column public.notification_routes.sms_fallback_at is
  'When an SMS-only route was put back to existing because texts stopped being deliverable. Cleared when the owner chooses routes again or dismisses the note.';
comment on column public.notification_routes.sms_fallback_reason is
  'Why the SMS-only route fell back: sms_off, category_off, stopped (STOP received) or phone_changed.';

-- One definition of "an SMS route can still deliver", shared by every trigger
-- below. It mirrors the enqueue condition in private.enqueue_notification_sms
-- plus the STOP list the send path checks, so the route falls back exactly when
-- the queue would stop producing texts. The reason is read from the state that
-- made it undeliverable, not from whichever trigger happened to notice.
create function private.reset_undeliverable_sms_routes(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pref public.sms_preferences%rowtype;
  v_phone_ok boolean := false;
  v_stopped boolean := false;
  v_plans boolean := false;
  v_reminders boolean := false;
  v_reason text;
begin
  if p_user is null then
    return;
  end if;

  select * into v_pref from public.sms_preferences where user_id = p_user;
  if found then
    v_phone_ok := exists (
      select 1 from public.profile_contacts c
       where c.user_id = p_user
         and c.kind = 'phone'
         and c.normalized_value = v_pref.phone
         and c.verified_at is not null
    );
    v_stopped := exists (
      select 1 from public.sms_opt_outs o where o.normalized_number = v_pref.phone
    );
    v_plans := v_pref.enabled and v_pref.plans and v_phone_ok and not v_stopped;
    v_reminders := v_pref.enabled and v_pref.reminders and v_phone_ok and not v_stopped;
  end if;

  v_reason := case
    when v_pref.user_id is null then 'sms_off'
    when v_stopped then 'stopped'
    when not v_pref.enabled then 'sms_off'
    when not v_phone_ok then 'phone_changed'
    else 'category_off'
  end;

  update public.notification_routes r
     set plans = case when r.plans = 'sms' and not v_plans then 'existing' else r.plans end,
         reminders = case when r.reminders = 'sms' and not v_reminders then 'existing' else r.reminders end,
         sms_fallback_at = now(),
         sms_fallback_reason = v_reason
   where r.user_id = p_user
     and ((r.plans = 'sms' and not v_plans) or (r.reminders = 'sms' and not v_reminders));
end;
$$;
revoke all on function private.reset_undeliverable_sms_routes(uuid)
  from public, anon, authenticated;
grant execute on function private.reset_undeliverable_sms_routes(uuid) to service_role;

-- Turning SMS off, unticking a category, or a subscription whose phone moved.
create function private.sms_preferences_route_fallback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.reset_undeliverable_sms_routes(new.user_id);
  return null;
end;
$$;
revoke all on function private.sms_preferences_route_fallback() from public, anon, authenticated;
grant execute on function private.sms_preferences_route_fallback() to service_role;
create trigger sms_preferences_route_fallback
after update of enabled, plans, reminders, phone on public.sms_preferences
for each row execute function private.sms_preferences_route_fallback();

-- A signed STOP webhook (an insert, or an upsert over an earlier STOP).
create function private.sms_opt_out_route_fallback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in
    select p.user_id from public.sms_preferences p where p.phone = new.normalized_number
  loop
    perform private.reset_undeliverable_sms_routes(v_user);
  end loop;
  return null;
end;
$$;
revoke all on function private.sms_opt_out_route_fallback() from public, anon, authenticated;
grant execute on function private.sms_opt_out_route_fallback() to service_role;
create trigger sms_opt_outs_route_fallback
after insert or update on public.sms_opt_outs
for each row execute function private.sms_opt_out_route_fallback();

-- The verified phone changed, lost its verification, or was removed. The
-- profile sync trigger (sync_profile_contacts) is what writes these rows when
-- the owner edits their number.
create function private.phone_contact_route_fallback()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kind <> 'phone' then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and new.normalized_value = old.normalized_value
     and new.verified_at is not null then
    return null;
  end if;
  -- Account deletion cascades through here after the profile row is gone;
  -- there is no route left to explain.
  if not exists (select 1 from public.profiles where id = old.user_id) then
    return null;
  end if;
  perform private.reset_undeliverable_sms_routes(old.user_id);
  return null;
end;
$$;
revoke all on function private.phone_contact_route_fallback() from public, anon, authenticated;
grant execute on function private.phone_contact_route_fallback() to service_role;
create trigger profile_contacts_route_fallback
after update of normalized_value, verified_at or delete on public.profile_contacts
for each row execute function private.phone_contact_route_fallback();

-- Choosing routes again clears the note, and SMS can only be chosen while it
-- can actually deliver: enabled, verified and not STOPped. Before this, a
-- STOPped number could still be picked for "SMS only" and go silent at once.
create or replace function private.set_notification_routes(p_plans text,p_reminders text,p_urgent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_plans is null or p_reminders is null or p_urgent is null or
 p_plans not in ('existing','push','sms','email','in_app') or p_reminders not in ('existing','push','sms','email','in_app') then raise exception 'Invalid preferences'; end if;
 if (p_plans='email' or p_reminders='email') and not exists(select 1 from public.profile_contacts where user_id=auth.uid() and kind='email' and verified_at is not null) then raise exception 'Verify your email first'; end if;
 if (p_plans='sms' or p_reminders='sms' or p_urgent) and not exists(
   select 1 from public.sms_preferences p
   join public.profile_contacts c on c.user_id=p.user_id and c.kind='phone' and c.normalized_value=p.phone and c.verified_at is not null
   where p.user_id=auth.uid() and p.enabled
     and not exists(select 1 from public.sms_opt_outs o where o.normalized_number=p.phone)
 ) then raise exception 'Enable SMS first'; end if;
 insert into public.notification_routes(user_id,plans,reminders) values(auth.uid(),p_plans,p_reminders)
 on conflict(user_id) do update set plans=excluded.plans,reminders=excluded.reminders,sms_fallback_at=null,sms_fallback_reason=null;
 update public.sms_preferences set plans=case when p_plans='sms' then true else plans end,reminders=case when p_reminders='sms' then true else reminders end,urgent_changes=p_urgent,updated_at=now() where user_id=auth.uid();
 insert into public.sms_consent_events(user_id,phone,enabled,plans,reminders,urgent_changes,source,policy_version) select user_id,phone,enabled,plans,reminders,urgent_changes,'notification_routes','2026-09-09' from public.sms_preferences where user_id=auth.uid();
end $$;

-- "Got it" on the Settings note, without re-choosing routes.
create function private.dismiss_sms_route_note()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  update public.notification_routes
     set sms_fallback_at = null,
         sms_fallback_reason = null
   where user_id = auth.uid();
end;
$$;
create function public.dismiss_sms_route_note()
returns void
language sql
security invoker
set search_path = ''
as $$select private.dismiss_sms_route_note()$$;
revoke all on function private.dismiss_sms_route_note(), public.dismiss_sms_route_note()
  from public, anon, authenticated;
grant execute on function private.dismiss_sms_route_note(), public.dismiss_sms_route_note()
  to authenticated, service_role;

-- Existing rows: anyone already silent today gets the same fallback now,
-- rather than waiting for their next preference change to notice.
do $$
declare
  v_user uuid;
begin
  for v_user in
    select user_id from public.notification_routes where plans = 'sms' or reminders = 'sms'
  loop
    perform private.reset_undeliverable_sms_routes(v_user);
  end loop;
end;
$$;

-- Settings reads the new columns, so health must notice if they are missing.
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

