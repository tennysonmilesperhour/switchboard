-- A moderator can delete their account after resolving reports and reviewing
-- venues. The decisions remain as an audit trail, with the deleted actor
-- cleared by ON DELETE SET NULL.

begin;
select plan(9);

-- moderator, reporter, and report target. The moderator also owns the venue,
-- exercising the older claimed_by ON DELETE SET NULL path in the same delete.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000d381', 'deleting-mod@example.com'),
  ('00000000-0000-0000-0000-00000000a381', 'deletion-reporter@example.com'),
  ('00000000-0000-0000-0000-00000000b381', 'deletion-target@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000d381', 'Deleting moderator', true),
  ('00000000-0000-0000-0000-00000000a381', 'Reporter', true),
  ('00000000-0000-0000-0000-00000000b381', 'Report target', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.platform_moderators (member_id)
values ('00000000-0000-0000-0000-00000000d381');

insert into public.user_reports (
  id,
  reporter_id,
  reported_id,
  reason,
  status,
  resolved_by,
  resolved_at
) values (
  '00000000-0000-0000-0000-00000000e381',
  '00000000-0000-0000-0000-00000000a381',
  '00000000-0000-0000-0000-00000000b381',
  'spam',
  'resolved',
  '00000000-0000-0000-0000-00000000d381',
  now()
);

insert into public.venues (
  id,
  name,
  perk,
  claimed_by,
  status,
  reviewed_by,
  reviewed_at
) values (
  '00000000-0000-0000-0000-00000000f381',
  'Deletion Test Cafe',
  'Free coffee refill',
  '00000000-0000-0000-0000-00000000d381',
  'verified',
  '00000000-0000-0000-0000-00000000d381',
  now()
);

select lives_ok(
  $$ delete from auth.users
     where id = '00000000-0000-0000-0000-00000000d381' $$,
  'a moderator with review history can delete their account'
);

select is(
  (select count(*)::int from auth.users
   where id = '00000000-0000-0000-0000-00000000d381'),
  0,
  'the auth user is deleted'
);

select is(
  (select count(*)::int from public.profiles
   where id = '00000000-0000-0000-0000-00000000d381'),
  0,
  'the profile is cascade-deleted'
);

select is(
  (select count(*)::int from public.platform_moderators
   where member_id = '00000000-0000-0000-0000-00000000d381'),
  0,
  'the moderator grant is cascade-deleted'
);

select is(
  (select count(*)::int from public.user_reports
   where id = '00000000-0000-0000-0000-00000000e381'),
  1,
  'the resolved report remains in the audit trail'
);

select is(
  (select resolved_by from public.user_reports
   where id = '00000000-0000-0000-0000-00000000e381'),
  null::uuid,
  'the deleted report resolver is cleared'
);

select is(
  (select count(*)::int from public.venues
   where id = '00000000-0000-0000-0000-00000000f381'),
  1,
  'the reviewed venue remains in the audit trail'
);

select is(
  (select claimed_by from public.venues
   where id = '00000000-0000-0000-0000-00000000f381'),
  null::uuid,
  'the deleted venue claimant is cleared'
);

select is(
  (select reviewed_by from public.venues
   where id = '00000000-0000-0000-0000-00000000f381'),
  null::uuid,
  'the deleted venue reviewer is cleared'
);

select * from finish();
rollback;
