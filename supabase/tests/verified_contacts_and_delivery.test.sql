-- Verified contact matching and host-only delivery evidence.

begin;
select plan(15);

insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-000000000001', 'contact-alice@example.com'),
  ('10000000-0000-0000-0000-000000000002', 'contact-mallory@example.com');

update public.profiles
set display_name = 'Alice', handle = 'contact_alice'
where id = '10000000-0000-0000-0000-000000000001';
update public.profiles
set display_name = 'Mallory', handle = 'contact_mallory',
    contact_email = 'mallory-contact@example.com',
    contact_phone = '+1 555 555 0102'
where id = '10000000-0000-0000-0000-000000000002';

insert into public.events (id, host_id, title, status) values
  ('10000000-0000-0000-0000-00000000e001',
   '10000000-0000-0000-0000-000000000001', 'Delivery test', 'inviting');
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('10000000-0000-0000-0000-00000000f001',
   '10000000-0000-0000-0000-00000000e001',
   '10000000-0000-0000-0000-000000000002', 0, 'sent');
insert into public.invite_delivery_attempts (invite_id, channel, status, provider) values
  ('10000000-0000-0000-0000-00000000f001', 'in_app', 'sent', 'switchboard');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.resolve_profile_contact('mallory-contact@example.com')),
  0,
  'unverified email does not resolve'
);
select is(
  (select count(*)::int from public.resolve_profile_contact('+1 555 555 0102')),
  0,
  'unverified phone does not resolve'
);
select is(
  (select count(*)::int from public.profile_contacts
   where user_id = '10000000-0000-0000-0000-000000000002'),
  0,
  'users cannot read another profile contact row'
);
select is(
  (select count(*)::int from public.invite_delivery_attempts),
  1,
  'event host can read delivery attempts'
);
select throws_ok(
  $$ insert into public.invite_delivery_attempts (invite_id, channel, status, provider)
     values ('10000000-0000-0000-0000-00000000f001', 'email', 'sent', 'resend') $$,
  '42501',
  null,
  'authenticated users cannot forge delivery attempts'
);

reset role;
update public.profile_contacts
set verified_at = now()
where user_id = '10000000-0000-0000-0000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select id from public.resolve_profile_contact('mallory-contact@example.com')),
  '10000000-0000-0000-0000-000000000002'::uuid,
  'verified email resolves to its profile'
);
select is(
  (select id from public.resolve_profile_contact('+1 555 555 0102')),
  '10000000-0000-0000-0000-000000000002'::uuid,
  'verified phone resolves to its profile'
);

select is(
  (
    select count(*)::int
    from generate_series(1, 6) as attempt(number)
    cross join lateral public.resolve_profile_contact(
      case when attempt.number > 0
        then 'mallory-contact@example.com'
        else ''
      end
    )
  ),
  6,
  'contact matching permits the remainder of ten attempts in an hour'
);

select throws_ok(
  $$ select * from public.resolve_profile_contact('mallory-contact@example.com') $$,
  'P0001',
  'contact-match rate limit',
  'contact matching rejects the eleventh attempt at the database boundary, out loud'
);
select is(
  (select id from public.resolve_profile_contact('@contact_mallory')),
  '10000000-0000-0000-0000-000000000002'::uuid,
  'a handle lookup is public and does not spend the contact-match bucket'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::int from public.invite_delivery_attempts),
  0,
  'invitee cannot read host-only delivery evidence'
);

reset role;
select ok(
  not has_function_privilege('authenticated', 'public.app_schema_version()', 'EXECUTE'),
  'schema readiness function is not exposed to application users'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'approve_join_request', 'are_connected', 'bump_poll_tally',
        'can_access_event_thread', 'can_view_event', 'check_mutual_match',
        'create_board', 'find_shared_moments', 'handle_new_user',
        'is_board_member', 'is_board_moderator', 'is_event_host',
        'is_room_member', 'list_open_tables', 'my_matchmaker_proposals',
        'poll_results', 'request_to_join', 'respond_to_guest_invite',
        'respond_to_invite', 'respond_to_matchmaker'
      ])
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'anonymous role cannot execute privileged public helpers'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(array[
        'freeze_board_owner', 'freeze_connection_parties', 'freeze_event_host',
        'freeze_ritual_parties', 'move_queued_invite', 'set_invite_window',
        'sync_profile_contacts'
      ])
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'anonymous role cannot execute release-cleanup helpers'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in ('media public read', 'profile media public read')
  ),
  0,
  'public media buckets cannot be enumerated through the Data API'
);

select * from finish();
rollback;
