-- pgTAP coverage for "show the invite list" (20260930012000_invite_list_visibility.sql,
-- decision D3).
--
-- A guest sees who else was invited only when the host has switched the list
-- on; they never see anyone still queued, anyone who declined or expired, or a
-- contact detail; and the list does not reveal who said yes unless "show
-- who's in" is on as well. Someone who cannot view the plan gets nothing.
--
--   supabase test db

begin;
select plan(12);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f1001', 'list-host@example.com'),
  ('00000000-0000-0000-0000-0000000f1002', 'list-guest@example.com'),
  ('00000000-0000-0000-0000-0000000f1003', 'list-going@example.com'),
  ('00000000-0000-0000-0000-0000000f1004', 'list-queued@example.com'),
  ('00000000-0000-0000-0000-0000000f1005', 'list-declined@example.com'),
  ('00000000-0000-0000-0000-0000000f1006', 'list-expired@example.com'),
  ('00000000-0000-0000-0000-0000000f1007', 'list-stranger@example.com'),
  ('00000000-0000-0000-0000-0000000f1008', 'list-waitlisted@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000f1001', 'List Host', true),
  ('00000000-0000-0000-0000-0000000f1002', 'Guest', true),
  ('00000000-0000-0000-0000-0000000f1003', 'Going', true),
  ('00000000-0000-0000-0000-0000000f1004', 'Queued', true),
  ('00000000-0000-0000-0000-0000000f1005', 'Declined', true),
  ('00000000-0000-0000-0000-0000000f1006', 'Expired', true),
  ('00000000-0000-0000-0000-0000000f1007', 'Stranger', true),
  ('00000000-0000-0000-0000-0000000f1008', 'Waitlisted', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Both toggles start off, as the wizard defaults the invite list.
insert into public.events (id, host_id, title, status, show_invite_list, show_accepted) values
  ('00000000-0000-0000-0000-0000000f1e01', '00000000-0000-0000-0000-0000000f1001',
   'Listed dinner', 'inviting', false, false);

insert into public.invites (
  id, event_id, invitee_id, guest_name, guest_contact, position, status, sent_at
) values
  ('00000000-0000-0000-0000-0000000f1a02', '00000000-0000-0000-0000-0000000f1e01',
   '00000000-0000-0000-0000-0000000f1002', null, null, 0, 'sent', now()),
  ('00000000-0000-0000-0000-0000000f1a03', '00000000-0000-0000-0000-0000000f1e01',
   '00000000-0000-0000-0000-0000000f1003', null, null, 1, 'accepted', now()),
  ('00000000-0000-0000-0000-0000000f1a04', '00000000-0000-0000-0000-0000000f1e01',
   '00000000-0000-0000-0000-0000000f1004', null, null, 2, 'queued', null),
  ('00000000-0000-0000-0000-0000000f1a05', '00000000-0000-0000-0000-0000000f1e01',
   '00000000-0000-0000-0000-0000000f1005', null, null, 3, 'declined', now()),
  ('00000000-0000-0000-0000-0000000f1a06', '00000000-0000-0000-0000-0000000f1e01',
   '00000000-0000-0000-0000-0000000f1006', null, null, 4, 'expired', now()),
  ('00000000-0000-0000-0000-0000000f1a08', '00000000-0000-0000-0000-0000000f1e01',
   '00000000-0000-0000-0000-0000000f1008', null, null, 5, 'waitlisted', now()),
  -- A guest the host added by email, whose "name" is that address.
  ('00000000-0000-0000-0000-0000000f1a09', '00000000-0000-0000-0000-0000000f1e01',
   null, 'friend@example.com', 'friend@example.com', 6, 'sent', now());

-- ————————————————————————— the flag is off —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f1002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')),
  0,
  'with the invite list off, a guest sees nobody'
);

-- ————————————————————————— the flag is on —————————————————————————
reset role;
update public.events set show_invite_list = true
 where id = '00000000-0000-0000-0000-0000000f1e01';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f1002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')),
  4,
  'with the invite list on, a guest sees everyone whose invitation went out'
);
select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')
    where invitee_id = '00000000-0000-0000-0000-0000000f1004'),
  0,
  'a queued invitee (not yet asked) is never listed'
);
select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')
    where invitee_id in ('00000000-0000-0000-0000-0000000f1005',
                         '00000000-0000-0000-0000-0000000f1006')),
  0,
  'declined and expired invitations are never listed'
);
select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')
    where status <> 'invited'),
  0,
  'with "show who''s in" off, the list does not reveal who said yes'
);
select is(
  (select display_name from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')
    where invite_id = '00000000-0000-0000-0000-0000000f1a09'),
  'Guest',
  'a guest name that is really a contact address is never shown'
);

-- ————————————————————————— "show who's in" as well —————————————————————————
reset role;
update public.events set show_accepted = true
 where id = '00000000-0000-0000-0000-0000000f1e01';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f1002","role":"authenticated"}', true);

select is(
  (select status from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')
    where invitee_id = '00000000-0000-0000-0000-0000000f1003'),
  'accepted',
  'with both toggles on, the list says who is in'
);
select is(
  (select status from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')
    where invitee_id = '00000000-0000-0000-0000-0000000f1008'),
  'waitlisted',
  'and who is on the waitlist'
);

-- ————————————————————————— people who cannot view the plan —————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f1007","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')),
  0,
  'a stranger gets nothing, flag or no flag'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f1004","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.event_invite_list('00000000-0000-0000-0000-0000000f1e01')),
  0,
  'a queued invitee cannot read the list of a plan they cannot yet see'
);

reset role;
select ok(
  not has_function_privilege('anon', 'public.event_invite_list(uuid)', 'EXECUTE'),
  'anon cannot call the invite list'
);
select ok(
  not has_function_privilege('anon', 'private.event_invite_list(uuid)', 'EXECUTE'),
  'anon cannot call the private body either'
);

select * from finish();
rollback;
