-- W22/W24: UI bypasses cannot commit an RSVP without eligibility and answers.
begin;
select no_plan();
create function pg_temp.rid(n int) returns uuid language sql immutable as $$
  select ('24000000-0000-0000-0000-' || lpad(n::text, 12, '0'))::uuid;
$$;
insert into auth.users(id, email) select pg_temp.rid(n), 'rsvp-' || n || '@example.com' from generate_series(1,5) n;
update public.profiles set onboarded = true, legal_terms_version = '2026-08-31'
 where id in (select pg_temp.rid(n) from generate_series(1,5) n);
insert into public.events(id, host_id, title, status, invite_mode, open_table, share_token) values
  (pg_temp.rid(10), pg_temp.rid(1), 'Intake', 'inviting', 'group', true, pg_temp.rid(11));
insert into public.event_questions(id, event_id, prompt, required, kind, options, position) values
  (pg_temp.rid(20), pg_temp.rid(10), 'Meal', true, 'choice', array['Veg','Other'], 0);
insert into public.events(id, host_id, title, status) values
  (pg_temp.rid(12), pg_temp.rid(1), 'Other event', 'inviting');
insert into public.event_questions(id, event_id, prompt, required, position) values
  (pg_temp.rid(21), pg_temp.rid(10), 'Optional note', false, 1),
  (pg_temp.rid(22), pg_temp.rid(12), 'Other event question', false, 0);
insert into public.invites(id, event_id, invitee_id, status, position, guest_token, guest_name) values
  (pg_temp.rid(30), pg_temp.rid(10), pg_temp.rid(2), 'sent', 0, pg_temp.rid(31), null),
  (pg_temp.rid(32), pg_temp.rid(10), null, 'sent', 1, pg_temp.rid(33), 'Guest'),
  (pg_temp.rid(34), pg_temp.rid(10), pg_temp.rid(5), 'requested', 2, pg_temp.rid(35), null);
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',pg_temp.rid(2),'role','authenticated')::text, true);
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true)$$,
  'P0001', null, 'the old RPC signature cannot skip required answers');
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'   '))$$, 'P0001', null, 'whitespace is not an answer');
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Not an option'))$$, 'P0001', null, 'choices are validated');
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,42))$$, 'P0001', null, 'non-string answers are rejected');
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg',pg_temp.rid(99)::text,'foreign'))$$,
  'P0001', null, 'unknown or foreign question IDs are rejected');
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg',pg_temp.rid(22)::text,'foreign'))$$,
  'P0001', null, 'a real question belonging to another event is rejected');
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg',pg_temp.rid(21)::text,repeat('a',2001)))$$,
  'P0001', null, 'oversized optional answers are also rejected');
select is((select status from public.invites where id=pg_temp.rid(30)), 'sent', 'failures leave the RSVP unchanged');
select is((select count(*)::int from public.invite_answers where invite_id=pg_temp.rid(30)),0,'failures leave no partial answers');
select is(public.respond_to_invite(pg_temp.rid(30),false,'','{}'),'declined','declining needs neither a note nor intake answers');
select is((select decline_note from public.invites where id=pg_temp.rid(30)),null::text,'an omitted decline note is stored as null');
reset role;
update public.profiles set onboarded=false where id=pg_temp.rid(2);
set local role authenticated;
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg'))$$,
  'P0001', 'Finish onboarding before answering this invitation', 'direct RPC enforces onboarding');
reset role;
update public.profiles set onboarded=true, legal_terms_version=null where id=pg_temp.rid(2);
set local role authenticated;
select throws_ok($$select public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg'))$$,
  'P0001', 'Accept the current terms before answering this invitation', 'direct RPC enforces current terms');
reset role;
update public.profiles set legal_terms_version='2026-08-31' where id=pg_temp.rid(2);
set local role authenticated;
select is(public.respond_to_invite(pg_temp.rid(30),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,' Veg ')), 'accepted', 'valid answers and acceptance commit together');
select is((select answer from public.invite_answers where invite_id=pg_temp.rid(30)), 'Veg', 'saved answer is trimmed');
select throws_ok($$select public.respond_to_guest_invite(pg_temp.rid(33),true,pg_temp.rid(3),'{}')$$,
  '42501',null,'a browser cannot supply somebody else as the service-role responder');
reset role;
set local role service_role;
update public.profiles set onboarded=false where id=pg_temp.rid(3);
select throws_ok($$select public.respond_to_guest_invite(pg_temp.rid(33),true,pg_temp.rid(3),
  jsonb_build_object(pg_temp.rid(20)::text,'Veg'))$$,
  'P0001','Finish onboarding before answering this invitation','guest token cannot bypass onboarding');
update public.profiles set onboarded=true where id=pg_temp.rid(3);
update public.profiles set legal_terms_version='old' where id=pg_temp.rid(4);
select throws_ok($$select * from public.rsvp_via_share_token(pg_temp.rid(11),pg_temp.rid(4),'Four','',true,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg'))$$,
  'P0001','Accept the current terms before answering this invitation','share token cannot bypass terms');
update public.profiles set legal_terms_version='2026-08-31' where id=pg_temp.rid(4);
select throws_ok($$select public.respond_to_guest_invite(pg_temp.rid(33),true,pg_temp.rid(3),'{}')$$,
  'P0001',null,'guest token path also requires answers');
select is((select invitee_id from public.invites where id=pg_temp.rid(32)),null::uuid,'failed guest RSVP also rolls back account attachment');
select is(public.respond_to_guest_invite(pg_temp.rid(33),true,pg_temp.rid(3),
  jsonb_build_object(pg_temp.rid(20)::text,'Other')), 'accepted','guest path commits answers and identity');
select is((select invitee_id from public.invites where id=pg_temp.rid(32)),pg_temp.rid(3),'guest is attached to the verified responder');
select throws_ok($$select * from public.rsvp_via_share_token(pg_temp.rid(11),pg_temp.rid(4),'Four','',true,'{}')$$,
  'P0001',null,'share path also requires answers');
select is((select count(*)::int from public.invites where invitee_id=pg_temp.rid(4)),0,'failed share RSVP rolls back its newly created invitation');
select is((select outcome from public.rsvp_via_share_token(pg_temp.rid(11),pg_temp.rid(4),'Four','',true,
  jsonb_build_object(pg_temp.rid(20)::text,'Veg'))),'accepted','valid share RSVP succeeds');
reset role;
select throws_ok($$update public.invites set status='accepted' where id=pg_temp.rid(34)$$,
  'P0001',null,'alternate privileged writers cannot bypass the required-answer backstop');
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub',pg_temp.rid(1),'role','authenticated')::text,true);
select is(public.approve_join_request(pg_temp.rid(34)),'sent','host approval invites the requester to finish unanswered questions');
select set_config('request.jwt.claims', json_build_object('sub',pg_temp.rid(5),'role','authenticated')::text,true);
select is(public.respond_to_invite(pg_temp.rid(34),true,null,
  jsonb_build_object(pg_temp.rid(20)::text,'Other')),'accepted','welcomed requester can complete their intake and join');
select * from finish();
rollback;
