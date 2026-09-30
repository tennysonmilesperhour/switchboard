-- pgTAP coverage for 20260930030000_sms_route_fallback.sql.
--
-- "SMS only" must never mean "nothing". Each way texts stop being deliverable
-- (SMS switched off, the category unticked, STOP, a changed or unverified
-- phone) puts an SMS route back to 'existing' and records why, and SMS cannot
-- be chosen again until it can actually deliver.
begin;
select plan(28);

insert into auth.users(id, email) values
  ('23000000-0000-0000-0000-000000000001', 'route-fallback@example.com'),
  ('23000000-0000-0000-0000-000000000002', 'route-bystander@example.com');
update public.profiles
   set contact_phone = '+15555550321', timezone = 'UTC'
 where id = '23000000-0000-0000-0000-000000000001';
update public.profiles
   set contact_phone = '+15555550322', timezone = 'UTC'
 where id = '23000000-0000-0000-0000-000000000002';
update public.profile_contacts
   set verified_at = now()
 where user_id in ('23000000-0000-0000-0000-000000000001', '23000000-0000-0000-0000-000000000002')
   and kind = 'phone';

-- ——— The member subscribes and routes both categories to SMS. ———
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.set_sms_preferences(true, true, true);
select lives_ok($$select public.set_notification_routes('sms', 'sms', false)$$, 'A deliverable subscription can be chosen as the only channel');
reset role;
select is((select plans || '/' || reminders from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'sms/sms', 'Both categories route to SMS');
select is((select sms_fallback_at from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), null::timestamptz, 'No note before anything changes');

-- ——— Unticking one category falls back for that category only. ———
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.set_sms_preferences(true, false, true);
reset role;
select is((select plans from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'existing', 'Unticking plans puts the plans route back to existing');
select is((select reminders from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'sms', 'A still-deliverable category keeps its SMS route');
select is((select sms_fallback_reason from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'category_off', 'The note names the unticked category');
select isnt((select sms_fallback_at from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), null::timestamptz, 'The fallback is time-stamped for Settings');

-- ——— Choosing again clears the note (and re-ticks the category). ———
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.set_notification_routes('sms', 'sms', false);
reset role;
select is((select sms_fallback_reason from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), null, 'Re-choosing routes clears the note');
select ok((select plans from public.sms_preferences where user_id = '23000000-0000-0000-0000-000000000001'), 'Selecting SMS re-enables that text category');

-- ——— STOP. ———
insert into public.sms_opt_outs(normalized_number) values ('+15555550321');
select is((select plans || '/' || reminders from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'existing/existing', 'STOP puts every SMS route back to existing');
select is((select sms_fallback_reason from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'stopped', 'The note says the number texted STOP');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.set_notification_routes('sms', 'existing', false)$$, 'P0001', 'Enable SMS first', 'A STOPped number cannot be chosen as the only channel');
select throws_ok($$select public.set_notification_routes('existing', 'existing', true)$$, 'P0001', 'Enable SMS first', 'Urgent texts cannot be allowed for a STOPped number');
reset role;

-- START restores the possibility, never the route itself.
delete from public.sms_opt_outs where normalized_number = '+15555550321';
select is((select plans from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'existing', 'START does not silently re-route anything to SMS');

-- ——— Turning SMS off. ———
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.set_notification_routes('sms', 'existing', false);
select public.set_sms_preferences(false, true, true);
reset role;
select is((select plans from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'existing', 'Turning SMS off puts the route back to existing');
select is((select sms_fallback_reason from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'sms_off', 'The note says SMS was turned off');

-- ——— Changing the phone number. ———
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select public.set_sms_preferences(true, true, true);
select public.set_notification_routes('existing', 'sms', false);
select public.dismiss_sms_route_note();
reset role;
select is((select sms_fallback_at from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), null::timestamptz, 'Dismissing clears the note');
select is((select reminders from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'sms', 'Dismissing changes no route');
update public.profiles set contact_phone = '+15555550399' where id = '23000000-0000-0000-0000-000000000001';
select is((select reminders from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'existing', 'A changed phone puts the route back to existing');
select is((select sms_fallback_reason from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'phone_changed', 'The note says the phone changed');

-- Removing the phone entirely behaves the same way.
update public.profiles set contact_phone = '+15555550321' where id = '23000000-0000-0000-0000-000000000001';
update public.profile_contacts set verified_at = now() where user_id = '23000000-0000-0000-0000-000000000001' and kind = 'phone';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.set_notification_routes('sms', 'existing', false)$$, 'Re-verifying the subscribed phone makes SMS choosable again');
reset role;
update public.profiles set contact_phone = null where id = '23000000-0000-0000-0000-000000000001';
select is((select plans from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000001'), 'existing', 'Removing the phone puts the route back to existing');

-- ——— Nobody else is touched, and nobody can write routes directly. ———
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select public.set_sms_preferences(true, true, true);
select public.set_notification_routes('sms', 'sms', false);
reset role;
insert into public.sms_opt_outs(normalized_number) values ('+15555550999');
select is((select plans || '/' || reminders from public.notification_routes where user_id = '23000000-0000-0000-0000-000000000002'), 'sms/sms', 'Another number''s STOP leaves this route alone');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"23000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$update public.notification_routes set sms_fallback_at = null$$, '42501', null, 'Routes are not directly writable by their owner');
select throws_ok($$select private.reset_undeliverable_sms_routes('23000000-0000-0000-0000-000000000001')$$, '42501', null, 'The reset helper is not callable from the API');
reset role;

set local role anon;
select throws_ok($$select public.dismiss_sms_route_note()$$, '42501', null, 'Anonymous callers cannot dismiss anything');
reset role;

-- ——— Health notices the new objects. ———
select ok(not ((public.app_schema_status()->'missing') ? 'public.notification_routes.sms_fallback_at'), 'Health sees the fallback column');
alter table public.notification_routes rename column sms_fallback_at to health_missing_sms_fallback_at;
select ok((public.app_schema_status()->'missing') ? 'public.notification_routes.sms_fallback_at', 'Health names a missing fallback column');
alter table public.notification_routes rename column health_missing_sms_fallback_at to sms_fallback_at;

select * from finish();
rollback;
