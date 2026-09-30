-- Schema health knows about what the completion plan added.
--
-- `/api/health` reports a deploy as incomplete when an object the app needs is
-- missing, even if migration history says it was applied (the September SMS
-- repair was found this way). The tables, columns and functions added by the
-- completion plan's migrations were not on its list, so a half-applied deploy
-- of any of them would have reported healthy. This carries every existing
-- entry from 20260930030000 unchanged and adds them. Functions are checked by
-- name, so a signature change later does not read as a missing object.

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
      ('public.list_suspended_accounts', exists (select 1 from pg_catalog.pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'list_suspended_accounts'))
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
