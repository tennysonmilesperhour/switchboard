-- pgTAP coverage for 20261008130000_verified_facts_selves_mood.sql.
--
-- Verified facts: the trust tier is not writable by its owner, and vouching
-- needs a connection who is email-verified for the same org. Lanes: a pair
-- surfaces only when both lanes are on, audiences and dating preferences hold
-- both ways, and the strongest shared item clears both bars. Mood: raises the
-- bar, ends on its own, can pause lanes. Writes: a blind tap on someone who
-- would not surface behaves exactly like any other tap and forms no match, so a
-- refusal can never be read back as a stranger's mood or weights.

begin;
select plan(53);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d0001', 'dl-a@example.com'),
  ('00000000-0000-0000-0000-0000000d0002', 'dl-b@example.com'),
  ('00000000-0000-0000-0000-0000000d0003', 'dl-c@example.com'),
  ('00000000-0000-0000-0000-0000000d0004', 'dl-d@example.com'),
  ('00000000-0000-0000-0000-0000000d0005', 'dl-e@example.com');
insert into public.profiles (id, display_name, handle, onboarded, discoverable, interests)
values
  ('00000000-0000-0000-0000-0000000d0001', 'DL A', 'dl_a', true, true, array['Hiking', 'Chess', 'Vinyl']),
  ('00000000-0000-0000-0000-0000000d0002', 'DL B', 'dl_b', true, true, array['Hiking', 'Chess']),
  ('00000000-0000-0000-0000-0000000d0003', 'DL C', 'dl_c', true, true, array['Vinyl']),
  ('00000000-0000-0000-0000-0000000d0004', 'DL D', 'dl_d', true, true, array['Poetry']),
  ('00000000-0000-0000-0000-0000000d0005', 'DL E', 'dl_e', true, true, array['Poetry'])
on conflict (id) do update set
  display_name = excluded.display_name, handle = excluded.handle,
  onboarded = true, discoverable = true, interests = excluded.interests;

create function pg_temp.a() returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-0000000d0001'::uuid $$;
create function pg_temp.b() returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-0000000d0002'::uuid $$;
create function pg_temp.c() returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-0000000d0003'::uuid $$;
create function pg_temp.d() returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-0000000d0004'::uuid $$;
create function pg_temp.e() returns uuid language sql immutable as $$ select '00000000-0000-0000-0000-0000000d0005'::uuid $$;
create function pg_temp.act_as(who uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', who, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.back() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- Who A sees under a lane, as A.
create function pg_temp.sees(viewer uuid, lane text) returns uuid[] language plpgsql as $$
declare r uuid[];
begin
  perform pg_temp.act_as(viewer);
  select coalesce(array_agg(id order by id), '{}') into r from public.list_discovery_candidates(lane);
  perform pg_temp.back();
  return r;
end $$;

-- ————————————————————————— facts: the tier is not the owner's to write —————————————————————————
select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ insert into public.profile_facts (user_id, kind, label, org_key, tier, verified_at)
     values ('00000000-0000-0000-0000-0000000d0001', 'school', 'BYU', 'byu', 'email', now()) $$,
  '42501', null, 'a person cannot write their own fact, let alone its verified tier'
);
select throws_ok(
  $$ insert into public.fact_vouches (fact_id, voucher_id)
     values (gen_random_uuid(), '00000000-0000-0000-0000-0000000d0001') $$,
  '42501', null, 'nor write a vouch directly'
);
select pg_temp.back();

insert into public.profile_facts (id, user_id, kind, label, org_key, tier, verified_at, shown) values
  ('00000000-0000-0000-0000-00000000f001', pg_temp.a(), 'school', 'BYU', 'byu', 'email', now(), true),
  ('00000000-0000-0000-0000-00000000f002', pg_temp.b(), 'school', 'BYU', 'byu', 'email', now(), true),
  ('00000000-0000-0000-0000-00000000f003', pg_temp.c(), 'school', 'BYU', 'byu', 'claimed', null, true),
  ('00000000-0000-0000-0000-00000000f004', pg_temp.d(), 'school', 'BYU', 'byu', 'claimed', null, true),
  ('00000000-0000-0000-0000-00000000f005', pg_temp.e(), 'school', 'BYU', 'byu', 'email', now(), false);

select throws_ok(
  $$ insert into public.profile_facts (user_id, kind, label, org_key, tier, verified_at)
     values ('00000000-0000-0000-0000-0000000d0003', 'employer', 'Acme', 'acme', 'vouched', null) $$,
  '23514', null, 'a verified tier always carries its date, a claim never does'
);

select pg_temp.act_as(pg_temp.c());
select is(
  (select count(*)::int from public.profile_facts where user_id = pg_temp.e()),
  0, 'a fact its owner hid is invisible to everyone else'
);
select pg_temp.back();
select pg_temp.act_as(pg_temp.e());
select is(
  (select count(*)::int from public.profile_facts where user_id = pg_temp.e()),
  1, 'but not to its owner'
);
select pg_temp.back();

-- ————————————————————————— vouching —————————————————————————
insert into public.connections (requester_id, addressee_id, status) values
  (pg_temp.a(), pg_temp.d(), 'accepted'),
  (pg_temp.b(), pg_temp.d(), 'accepted'),
  (pg_temp.c(), pg_temp.d(), 'accepted');

select pg_temp.act_as(pg_temp.c());
select is(public.vouch_for_fact('00000000-0000-0000-0000-00000000f004'), 'cannot_vouch',
  'an unverified claim cannot vouch for anyone');
select pg_temp.back();
select pg_temp.act_as(pg_temp.e());
select is(public.vouch_for_fact('00000000-0000-0000-0000-00000000f004'), 'not_connected',
  'a stranger cannot vouch');
select pg_temp.back();
select pg_temp.act_as(pg_temp.d());
select is(public.vouch_for_fact('00000000-0000-0000-0000-00000000f004'), 'own',
  'nobody vouches for themselves');
select pg_temp.back();
select pg_temp.act_as(pg_temp.a());
select is(public.vouch_for_fact('00000000-0000-0000-0000-00000000f004'), 'ok', 'a verified connection can vouch');
select pg_temp.back();
select is((select tier from public.profile_facts where id = '00000000-0000-0000-0000-00000000f004'),
  'claimed', 'one vouch is not enough');
select pg_temp.act_as(pg_temp.b());
select is(public.vouch_for_fact('00000000-0000-0000-0000-00000000f004'), 'ok', 'a second one');
select pg_temp.back();
select is((select tier from public.profile_facts where id = '00000000-0000-0000-0000-00000000f004'),
  'vouched', 'two email-verified connections make it vouched');
select pg_temp.act_as(pg_temp.b());
select is(public.withdraw_vouch('00000000-0000-0000-0000-00000000f004'), 'ok', 'a vouch can be withdrawn');
select pg_temp.back();
select is((select tier from public.profile_facts where id = '00000000-0000-0000-0000-00000000f004'),
  'claimed', 'withdrawing one takes it back to a claim');

-- ————————————————————————— lanes —————————————————————————
select is(pg_temp.sees(pg_temp.a(), 'friends'), array[pg_temp.b(), pg_temp.c(), pg_temp.e()]::uuid[],
  'with nothing configured, a discoverable person browses the friends lane exactly as before');
select is(pg_temp.sees(pg_temp.a(), 'dating'), '{}'::uuid[], 'dating and networking are off until someone turns them on');

-- A browse never carries a weight.
select ok(
  not exists (
    select 1 from pg_proc p, unnest(p.proargnames) n
    where p.proname = 'list_discovery_candidates' and n ilike '%weight%'
  ),
  'the browse function has no weight to return');

-- Both people turn dating on.
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_selves (user_id, self, enabled, bar) values (pg_temp.a(), 'dating', true, 30);
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
insert into public.discovery_selves (user_id, self, enabled, bar) values (pg_temp.b(), 'dating', true, 30);
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'dating'), array[pg_temp.b()]::uuid[],
  'a lane surfaces only people who turned the same lane on');

-- The bar compares the strongest shared item on both sides.
select pg_temp.act_as(pg_temp.a());
update public.discovery_selves set bar = 70 where user_id = pg_temp.a() and self = 'dating';
insert into public.discovery_weights (user_id, self, item, weight) values
  (pg_temp.a(), 'dating', 'interest:Hiking', 95);
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'dating'), '{}'::uuid[],
  'a high bar hides a pair whose shared items are only default-strength');
select pg_temp.act_as(pg_temp.b());
insert into public.discovery_weights (user_id, self, item, weight) values
  (pg_temp.b(), 'dating', 'interest:Hiking', 90);
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'dating'), array[pg_temp.b()]::uuid[],
  'it opens when both love the same thing');
select pg_temp.act_as(pg_temp.a());
select is(
  (select shared_interests from public.list_discovery_candidates('dating') where id = pg_temp.b()),
  array['Hiking']::text[], 'only the item that cleared the bar is shown, not every overlap');
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
update public.discovery_weights set weight = 60 where user_id = pg_temp.b() and item = 'interest:Hiking';
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'dating'), '{}'::uuid[],
  'one side cooling off is enough to close it');
select pg_temp.act_as(pg_temp.b());
update public.discovery_weights set weight = 0 where user_id = pg_temp.b() and item = 'interest:Hiking';
select pg_temp.back();
delete from public.discovery_selves where user_id = pg_temp.a() and self = 'dating';
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_selves (user_id, self, enabled, bar) values (pg_temp.a(), 'dating', true, 30);
select pg_temp.back();
select pg_temp.act_as(pg_temp.a());
select is(
  (select shared_interests from public.list_discovery_candidates('dating') where id = pg_temp.b()),
  array['Chess']::text[], 'a weight of 0 means never surface that item');
select pg_temp.back();

-- Dating preferences must hold in both directions.
delete from public.discovery_weights where user_id in (pg_temp.a(), pg_temp.b());
select pg_temp.act_as(pg_temp.a());
update public.discovery_selves set identifies_as = 'woman', interested_in = array['man'] where user_id = pg_temp.a() and self = 'dating';
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
update public.discovery_selves set identifies_as = 'woman' where user_id = pg_temp.b() and self = 'dating';
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'dating'), '{}'::uuid[], 'a stated preference is respected');
select is(pg_temp.sees(pg_temp.b(), 'dating'), '{}'::uuid[], 'and the other person never sees her either');
select pg_temp.act_as(pg_temp.b());
update public.discovery_selves set identifies_as = 'man', interested_in = array['woman'] where user_id = pg_temp.b() and self = 'dating';
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'dating'), array[pg_temp.b()]::uuid[], 'mutually compatible people surface');
select throws_ok(
  $$ insert into public.discovery_selves (user_id, self, identifies_as)
     values ('00000000-0000-0000-0000-0000000d0003', 'friends', 'woman') $$,
  '23514', null, 'dating preferences exist only on the dating lane');

-- ————————————————————————— audiences —————————————————————————
delete from public.discovery_selves where self = 'dating';
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_selves (user_id, self, enabled, visible_to) values (pg_temp.a(), 'friends', true, 'verified_only');
select pg_temp.back();
select is(pg_temp.sees(pg_temp.c(), 'friends'), array[pg_temp.b(), pg_temp.e()]::uuid[],
  'visible_to verified_only hides A from someone with only a claimed fact (C), and shows A to B');
select pg_temp.act_as(pg_temp.a());
update public.discovery_selves set visible_to = 'friends_of_friends' where user_id = pg_temp.a() and self = 'friends';
select pg_temp.back();
select is(pg_temp.sees(pg_temp.c(), 'friends'), array[pg_temp.a(), pg_temp.b(), pg_temp.e()]::uuid[],
  'friends_of_friends: C and A share a friend (D), so C may see A again');
select ok(array_position(pg_temp.sees(pg_temp.e(), 'friends'), pg_temp.a()) is null,
  'while E, who shares no friend with A, still cannot');
delete from public.discovery_selves;

-- ————————————————————————— mood —————————————————————————
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_mood (user_id, preset, bar_shift, expires_at)
values (pg_temp.a(), 'jetlagged', 45, now() + interval '12 hours');
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'friends'), array[pg_temp.b()]::uuid[],
  'a jet-lagged bar hides C and E, whose overlap is ordinary, and keeps B, who shares a verified school');
select pg_temp.act_as(pg_temp.a());
select is((select array_agg(id) from public.list_discoverable_people('all')), array[pg_temp.b()]::uuid[],
  'the original browse answers to the mood too');
select pg_temp.back();
delete from public.profile_facts where user_id in (pg_temp.a(), pg_temp.b());
select is(pg_temp.sees(pg_temp.a(), 'friends'), '{}'::uuid[],
  'and with the school gone, B''s ordinary overlap no longer clears a jet-lagged bar');
select pg_temp.act_as(pg_temp.a());
update public.discovery_mood set expires_at = now() - interval '1 minute' where user_id = pg_temp.a();
select pg_temp.back();
select is(array_length(pg_temp.sees(pg_temp.a(), 'friends'), 1), 3, 'a mood that has ended stops mattering');
select pg_temp.act_as(pg_temp.a());
update public.discovery_mood set expires_at = now() + interval '30 days', bar_shift = 0 where user_id = pg_temp.a();
select pg_temp.back();
select ok((select expires_at <= now() + interval '72 hours' from public.discovery_mood where user_id = pg_temp.a()),
  'a mood can never outlast 72 hours');
select pg_temp.act_as(pg_temp.a());
update public.discovery_mood set only_selves = array['dating'], expires_at = now() + interval '2 hours' where user_id = pg_temp.a();
select pg_temp.back();
select is(pg_temp.sees(pg_temp.a(), 'friends'), '{}'::uuid[], 'a mood that pauses the friends lane pauses it');
select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ update public.discovery_mood set user_id = '00000000-0000-0000-0000-0000000d0002' $$,
  '42501', null, 'a mood cannot be handed to someone else');
select pg_temp.back();
delete from public.discovery_mood;

-- ————————————————————————— taps —————————————————————————
-- A's lanes all off: no tapping either.
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_selves (user_id, self, enabled) values (pg_temp.a(), 'friends', false);
select throws_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind)
     values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0002', 'Hiking', 'discover_connect') $$,
  '42501', null, 'with every lane off you cannot mark interest');
select pg_temp.back();
delete from public.discovery_selves;

-- A blind tap on someone who would not surface looks like any other tap.
select pg_temp.act_as(pg_temp.c());
insert into public.discovery_selves (user_id, self, enabled) values (pg_temp.c(), 'friends', false);
select pg_temp.back();
select pg_temp.act_as(pg_temp.a());
select lives_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind)
     values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0003', 'Vinyl', 'discover_connect') $$,
  'tapping someone whose lane is off is accepted like any tap, so it reveals nothing');
select pg_temp.back();
select is((select count(*)::int from public.matches where kind = 'discover_connect'), 0, 'and forms no match');
delete from public.discovery_selves;
delete from public.mutual_intents;

-- Mood: B is jet-lagged when A taps, then B clears it and taps back.
select pg_temp.act_as(pg_temp.b());
insert into public.discovery_mood (user_id, preset, bar_shift, expires_at)
values (pg_temp.b(), 'jetlagged', 45, now() + interval '8 hours');
select pg_temp.back();
select pg_temp.act_as(pg_temp.a());
insert into public.mutual_intents (author_id, target_id, activity, kind)
values (pg_temp.a(), pg_temp.b(), 'Hiking', 'discover_connect');
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
select lives_ok(
  $$ insert into public.mutual_intents (author_id, target_id, activity, kind)
     values ('00000000-0000-0000-0000-0000000d0002', '00000000-0000-0000-0000-0000000d0001', 'Hiking', 'discover_connect') $$,
  'B can still tap while jet-lagged');
select pg_temp.back();
select is((select count(*)::int from public.matches where kind = 'discover_connect'), 0,
  'but no match forms while B''s bar is up, and nobody is told');
delete from public.discovery_mood;
select pg_temp.act_as(pg_temp.b());
update public.mutual_intents set status = 'active' where author_id = pg_temp.b();
select pg_temp.back();
select is((select count(*)::int from public.matches where kind = 'discover_connect'), 1,
  'once the mood ends the waiting interest matches on the next tap');
delete from public.matches; delete from public.mutual_intents;

-- Lanes never cross-match.
select pg_temp.act_as(pg_temp.a());
insert into public.mutual_intents (author_id, target_id, activity, kind)
values (pg_temp.a(), pg_temp.b(), 'Coffee (dating)', 'discover_connect');
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
insert into public.mutual_intents (author_id, target_id, activity, kind)
values (pg_temp.b(), pg_temp.a(), 'Coffee', 'discover_connect');
select pg_temp.back();
select is((select count(*)::int from public.matches where kind = 'discover_connect'), 0,
  'a dating tap and a friends tap on the same activity are different asks');
delete from public.mutual_intents;

-- A dating tap is gated by the dating lane, not by friends.
select pg_temp.act_as(pg_temp.a());
insert into public.mutual_intents (author_id, target_id, activity, kind)
values (pg_temp.a(), pg_temp.b(), 'Hiking (dating)', 'discover_connect');
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
insert into public.mutual_intents (author_id, target_id, activity, kind)
values (pg_temp.b(), pg_temp.a(), 'Hiking (dating)', 'discover_connect');
select pg_temp.back();
select is((select count(*)::int from public.matches where kind = 'discover_connect'), 0,
  'two dating taps form no match while dating is off, though friends is on');
insert into public.discovery_selves (user_id, self, enabled, bar)
values (pg_temp.a(), 'dating', true, 30), (pg_temp.b(), 'dating', true, 30);
select pg_temp.act_as(pg_temp.b());
update public.mutual_intents set status = 'active' where author_id = pg_temp.b();
select pg_temp.back();
select is((select count(*)::int from public.matches where kind = 'discover_connect'), 1,
  'and match once both have dating on');
delete from public.matches;
delete from public.mutual_intents;
delete from public.discovery_selves;

-- ————————————————————————— signals —————————————————————————
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_signals (user_id, target_id, self, kind, items)
values (pg_temp.a(), pg_temp.c(), 'friends', 'passed', array['interest:Vinyl']);
select throws_ok(
  $$ insert into public.discovery_signals (user_id, target_id, self, kind)
     values ('00000000-0000-0000-0000-0000000d0001', '00000000-0000-0000-0000-0000000d0001', 'friends', 'passed') $$,
  '42501', null, 'a signal about yourself is refused');
select pg_temp.back();
select is(array_position(pg_temp.sees(pg_temp.a(), 'friends'), pg_temp.c()), null,
  'someone you passed on stays out of view');
select pg_temp.act_as(pg_temp.c());
select is((select count(*)::int from public.discovery_signals), 0, 'and the person passed on can never see it');
select pg_temp.back();

-- ————————————————————————— ownership —————————————————————————
select pg_temp.act_as(pg_temp.a());
insert into public.discovery_selves (user_id, self, enabled) values (pg_temp.a(), 'networking', true);
select throws_ok(
  $$ update public.discovery_selves set user_id = '00000000-0000-0000-0000-0000000d0002' where user_id = '00000000-0000-0000-0000-0000000d0001' $$,
  '42501', null, 'a lane cannot be repointed at someone else');
select throws_ok(
  $$ insert into public.discovery_selves (user_id, self) values ('00000000-0000-0000-0000-0000000d0002', 'dating') $$,
  '42501', null, 'nor written on their behalf');
select pg_temp.back();
select pg_temp.act_as(pg_temp.b());
select is((select count(*)::int from public.discovery_selves), 0, 'lane settings are private to their owner');
select pg_temp.back();

-- ————————————————————————— browse is bounded —————————————————————————
delete from public.rate_limits where true;
select pg_temp.act_as(pg_temp.a());
select throws_ok(
  $$ do $d$ begin for i in 1..95 loop perform 1 from public.list_discovery_candidates('friends'); end loop; end $d$ $$,
  'P0001', null, 'browsing is rate limited inside the function');
select pg_temp.back();

select * from finish();
rollback;
