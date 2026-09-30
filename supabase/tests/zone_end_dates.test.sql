-- pgTAP coverage for 20260930043000_zone_end_dates.sql (G38, D23).
--
-- Every zone ends, a week out unless its organizer says otherwise; nobody
-- checks into one that has ended, though anyone can still check out; and
-- deleting a zone ends the check-ins in it instead of turning them loose.

begin;
select plan(9);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000a201a', 'ze-organizer@example.com'),
  ('00000000-0000-0000-0000-0000000a202b', 'ze-guest@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000a201a', 'ZE Organizer', true),
  ('00000000-0000-0000-0000-0000000a202b', 'ZE Guest', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.zones (id, slug, name, organizer_id) values
  ('00000000-0000-0000-0000-0000000f2001'::uuid, 'ze-summit', 'Summit',
   '00000000-0000-0000-0000-0000000a201a');
insert into public.zones (id, slug, name, organizer_id, ends_at) values
  ('00000000-0000-0000-0000-0000000f2002'::uuid, 'ze-last-year', 'Last Year',
   '00000000-0000-0000-0000-0000000a201a', now() + interval '1 hour');

select col_not_null('public', 'zones', 'ends_at', 'every zone has an end date');

select ok(
  (select ends_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
     from public.zones where slug = 'ze-summit'),
  'a zone ends a week out unless its organizer says otherwise'
);

select throws_ok(
  $$ update public.zones set starts_at = now() + interval '30 days'
      where slug = 'ze-summit' $$,
  '23514',
  null,
  'a zone cannot end before it starts'
);

-- A guest checks in while the zone is still on, then it ends.
insert into public.moments (id, user_id, zone_id, place_name, status, available_until) values
  ('00000000-0000-0000-0000-0000000d2001'::uuid, '00000000-0000-0000-0000-0000000a202b',
   '00000000-0000-0000-0000-0000000f2002'::uuid, 'Last Year', 'open', now() + interval '2 hours'),
  ('00000000-0000-0000-0000-0000000d2002'::uuid, '00000000-0000-0000-0000-0000000a202b',
   '00000000-0000-0000-0000-0000000f2001'::uuid, 'Summit', 'open', now() + interval '2 hours');
update public.zones set ends_at = now() - interval '1 minute' where slug = 'ze-last-year';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a202b","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.moments (user_id, zone_id, place_name, status, available_until)
     values ('00000000-0000-0000-0000-0000000a202b',
             '00000000-0000-0000-0000-0000000f2002'::uuid, 'Last Year', 'open',
             now() + interval '2 hours') $$,
  'this zone has ended',
  'nobody checks into a zone that has ended'
);

select lives_ok(
  $$ update public.moments set status = 'closed'
      where id = '00000000-0000-0000-0000-0000000d2001'::uuid $$,
  'but checking out of one is always allowed'
);

-- Home's Around card counts only a zone still on. The guest lives next to the
-- ended one; once it is pinned there, it still does not count.
reset role;
update public.profiles
   set home_latitude = 40.7128, home_longitude = -74.0060
 where id = '00000000-0000-0000-0000-0000000a202b';
update public.zones
   set latitude = 40.7130, longitude = -74.0055
 where slug = 'ze-last-year';
set local role authenticated;
select is(
  public.home_around_available(),
  false,
  'an ended zone near home does not light up the Around card'
);

reset role;
update public.zones set ends_at = now() + interval '1 day' where slug = 'ze-last-year';
set local role authenticated;
select is(
  public.home_around_available(),
  true,
  'the same zone does while it is on'
);

-- ————————————————————————— deleting a zone —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000a201a","role":"authenticated"}', true);
delete from public.zones where slug = 'ze-summit';

reset role;
select is(
  (select status from public.moments where id = '00000000-0000-0000-0000-0000000d2002'::uuid),
  'closed',
  'deleting a zone ends the check-ins in it'
);
select is(
  (select zone_id from public.moments where id = '00000000-0000-0000-0000-0000000d2002'::uuid),
  null::uuid,
  'and the ended check-in no longer points at the zone'
);

select * from finish();
rollback;
