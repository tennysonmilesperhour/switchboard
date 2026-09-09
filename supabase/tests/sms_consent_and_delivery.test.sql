begin;
select plan(21);
insert into auth.users(id,email) values ('20000000-0000-0000-0000-000000000001','sms-policy@example.com');
update public.profiles set contact_phone='+15555550999',quiet_hours_start=0,quiet_hours_end=0,timezone='UTC' where id='20000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.set_sms_preferences(true,true,true)$$,'P0001','Verify your current phone number first','Unverified numbers cannot subscribe');
select throws_ok($$insert into public.sms_preferences(user_id,phone) values(auth.uid(),'+15555550999')$$,'42501',null,'Cannot forge consent directly');
select throws_ok($$select * from public.sms_jobs$$,'42501',null,'Queue is private');
select throws_ok($$select * from public.sms_consent_events$$,'42501',null,'Consent evidence is private');
select throws_ok($$select public.claim_sms_jobs()$$,'42501',null,'Cannot drain queue as user');
select throws_ok($$select public.record_sms_status(gen_random_uuid(),'x','x','delivered',null)$$,'42501',null,'Cannot forge receipts');
reset role;
update public.profile_contacts set verified_at=now() where user_id='20000000-0000-0000-0000-000000000001' and kind='phone';
insert into public.notifications(user_id,kind,title,body) values ('20000000-0000-0000-0000-000000000001','event_invite','Plan','Test');
select is((select count(*)::int from public.sms_jobs),0,'Verification alone never subscribes');
set local role authenticated;
select lives_ok($$select public.set_sms_preferences(true,true,false)$$,'Explicit consent succeeds');
reset role;
select is((select count(*)::int from public.sms_consent_events),1,'Consent evidence is recorded');
insert into public.notifications(user_id,kind,title,body) values
 ('20000000-0000-0000-0000-000000000001','event_invite','Plan','Test'),
 ('20000000-0000-0000-0000-000000000001','reminder','Plan','Test'),
 ('20000000-0000-0000-0000-000000000001','room_message','Plan','Test');
select is((select count(*)::int from public.sms_jobs),1,'Only consented plan category enqueues');
select is((select count(*)::int from public.claim_sms_jobs()),1,'Worker claims ready job');
select is((select count(*)::int from public.claim_sms_jobs()),0,'Second worker cannot reclaim');
select ok(public.record_sms_status((select id from public.sms_jobs),'SM11111111111111111111111111111111','+15555550999','delivered',null),'Delivered callback accepted');
select ok(not public.record_sms_status((select id from public.sms_jobs),'SM11111111111111111111111111111111','+15555550999','queued',null),'Late queued callback ignored');
select is((select status from public.sms_jobs),'delivered','Receipt never regresses');
update public.profiles set contact_phone='+15555550888' where id='20000000-0000-0000-0000-000000000001';
insert into public.notifications(user_id,kind,title,body) values ('20000000-0000-0000-0000-000000000001','event_invite','New plan','Test');
select is((select count(*)::int from public.sms_jobs),1,'Changed contact does not inherit consent');
select is((select body from public.sms_jobs),null::text,'Message body removed after delivery');
insert into public.sms_jobs(user_id,phone,category,body,status,expires_at)
values('20000000-0000-0000-0000-000000000001','+15555550888','reminders','old reminder','pending',now()-interval '1 minute');
insert into public.sms_jobs(user_id,phone,category,body,status,updated_at)
values('20000000-0000-0000-0000-000000000001','+15555550888','plans','possibly sent','sending',now()-interval '10 minutes');
select is((select count(*)::int from public.claim_sms_jobs()),0,'Expired and ambiguous jobs are not sent');
select is((select count(*)::int from public.sms_jobs where status='expired'),1,'Stale reminders expire');
select is((select count(*)::int from public.sms_jobs where status='unknown' and body is null),1,'Killed worker is marked unknown, body cleared');
alter table public.sms_jobs rename to sms_jobs_test_missing;
select ok((public.app_schema_status()->'missing') ? 'public.sms_jobs','Health detects missing SMS table despite migration history');
alter table public.sms_jobs_test_missing rename to sms_jobs;
select * from finish();
rollback;
