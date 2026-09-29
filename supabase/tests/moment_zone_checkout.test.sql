-- pgTAP tests for 20260929120000_moment_zone_checkout.sql.
--
-- A member removed from a private zone must still be able to end a check-in
-- they opened there, and the retention sweep's bulk close must not be rolled
-- back by their row. Neither exemption may let them stay counted: extending a
-- moment in a zone they have left is still refused.

begin;
select plan(4);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000301a', 'organizer@example.com'),
  ('00000000-0000-0000-0000-00000000302b', 'leaver@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000301a', 'Organizer', true),
  ('00000000-0000-0000-0000-00000000302b', 'Leaver', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.zones (id, slug, name, organizer_id, visibility) values
  ('00000000-0000-0000-0000-0000000f0301'::uuid, 'reunion-weekend', 'Reunion Weekend',
   '00000000-0000-0000-0000-00000000301a', 'private');

insert into public.zone_members (zone_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000f0301'::uuid,
   '00000000-0000-0000-0000-00000000302b', 'member');

-- Opened while still a member, so the insert itself is legitimate.
insert into public.moments (id, user_id, place_name, zone_id, status, available_until) values
  ('00000000-0000-0000-0000-0000000a0301'::uuid, '00000000-0000-0000-0000-00000000302b',
   'Lobby', '00000000-0000-0000-0000-0000000f0301'::uuid, 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000a0302'::uuid, '00000000-0000-0000-0000-00000000302b',
   'Patio', '00000000-0000-0000-0000-0000000f0301'::uuid, 'open', now() + interval '2 hours');

-- Then removed from the zone.
delete from public.zone_members
  where zone_id = '00000000-0000-0000-0000-0000000f0301'::uuid
    and member_id = '00000000-0000-0000-0000-00000000302b';

-- ————————————————————————— as the removed member —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000302b","role":"authenticated"}', true);

select lives_ok(
  $$ update public.moments set status = 'closed'
     where id = '00000000-0000-0000-0000-0000000a0301'::uuid $$,
  'a member removed from a private zone can still check out of a moment there'
);

select throws_ok(
  $$ update public.moments set available_until = now() + interval '1 day'
     where id = '00000000-0000-0000-0000-0000000a0302'::uuid $$,
  'cannot check into a zone you are not part of',
  'a removed member cannot extend a moment in a zone they have left'
);

-- ————————————————————————— as the retention sweep —————————————————————————
reset role;

select lives_ok(
  $$ update public.moments set status = 'closed'
     where status = 'open'
       and user_id = '00000000-0000-0000-0000-00000000302b' $$,
  'the bulk close is not rolled back by a removed member''s row'
);

select is(
  (select count(*)::int from public.moments
    where user_id = '00000000-0000-0000-0000-00000000302b' and status = 'open'),
  0,
  'every one of their moments is closed'
);

select * from finish();
rollback;
