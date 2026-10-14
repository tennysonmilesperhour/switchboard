-- pgTAP coverage for 20261014121000_hang_again.sql.
-- Only people who were at the same finished plan can say "hang out again";
-- a one-sided yes is invisible; two yeses open a match room; a no is private.

begin;
select plan(18);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000ca001', 'hang-host@example.com'),
  ('00000000-0000-0000-0000-0000000ca002', 'hang-guest@example.com'),
  ('00000000-0000-0000-0000-0000000ca003', 'hang-friend@example.com'),
  ('00000000-0000-0000-0000-0000000ca004', 'hang-decliner@example.com'),
  ('00000000-0000-0000-0000-0000000ca005', 'hang-outsider@example.com'),
  ('00000000-0000-0000-0000-0000000ca006', 'hang-quiet@example.com'),
  ('00000000-0000-0000-0000-0000000ca007', 'hang-blocked@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000ca001', 'Host', true),
  ('00000000-0000-0000-0000-0000000ca002', 'Guest', true),
  ('00000000-0000-0000-0000-0000000ca003', 'Friend', true),
  ('00000000-0000-0000-0000-0000000ca004', 'Decliner', true),
  ('00000000-0000-0000-0000-0000000ca005', 'Outsider', true),
  ('00000000-0000-0000-0000-0000000ca006', 'Quiet', true),
  ('00000000-0000-0000-0000-0000000ca007', 'Blocked', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- Friend is already a connection of Host, so Host is never asked about them.
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-0000000ca003', 'accepted');

insert into public.events (id, host_id, title, status, starts_at) values
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca001', 'Supper club', 'confirmed', now() - interval '3 days'),
  ('00000000-0000-0000-0000-0000000ce002', '00000000-0000-0000-0000-0000000ca001', 'Next week', 'confirmed', now() + interval '5 days');
insert into public.invites (event_id, invitee_id, status, position) values
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca002', 'accepted', 0),
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca003', 'accepted', 1),
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca004', 'declined', 2),
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca006', 'accepted', 3),
  ('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca007', 'accepted', 4),
  ('00000000-0000-0000-0000-0000000ce002', '00000000-0000-0000-0000-0000000ca002', 'accepted', 0);

-- A block that came after the plan.
insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-0000000ca007', '00000000-0000-0000-0000-0000000ca001');

-- ————————————————————————— grants —————————————————————————
select ok(
  not has_function_privilege('anon', 'public.answer_hang_again(uuid, uuid, boolean)', 'execute'),
  'signed-out callers cannot answer'
);
select ok(
  not has_function_privilege('authenticated', 'private.took_part_in(uuid, uuid)', 'execute'),
  'the participation helper is not callable directly'
);

-- ————————————————————————— who Host is asked about —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ca001","role":"authenticated"}', true);

select results_eq(
  $$select person_name from public.hang_again_prompts() order by person_name$$,
  $$values ('Guest'::text), ('Quiet'::text)$$,
  'asked about guests who said yes: not a connection, a decliner, an outsider, or a block'
);

select throws_ok(
  $$insert into public.mutual_intents (author_id, target_id, activity, kind, event_id)
    values ('00000000-0000-0000-0000-0000000ca001', '00000000-0000-0000-0000-0000000ca005',
            'Hang out again', 'hang_again', '00000000-0000-0000-0000-0000000ce001')$$,
  '42501', null, 'the client cannot write a hang_again intent directly'
);
select throws_ok(
  $$select public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca005', true)$$,
  '42501', null, 'someone who was not at the plan cannot be answered about'
);
select throws_ok(
  $$select public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca004', true)$$,
  '42501', null, 'someone who declined was not there'
);
select throws_ok(
  $$select public.answer_hang_again('00000000-0000-0000-0000-0000000ce002', '00000000-0000-0000-0000-0000000ca002', true)$$,
  '42501', null, 'a plan that has not happened cannot be answered about'
);
select throws_ok(
  $$select public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca007', true)$$,
  '42501', null, 'a blocked pair cannot be answered about'
);

select is(
  public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca002', true),
  'saved',
  'a first yes is saved, not matched'
);
select is(
  public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca006', false),
  'saved',
  'a no is saved the same way'
);
select is(
  (select count(*)::int from public.hang_again_prompts()),
  0,
  'answered people are not asked about again'
);
select is(
  (select kind from public.discovery_signals
   where user_id = '00000000-0000-0000-0000-0000000ca001'
     and target_id = '00000000-0000-0000-0000-0000000ca006'),
  'passed',
  'a no is a private pass in the friends lane'
);

-- ————————————————————————— Guest's side —————————————————————————
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ca002","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.mutual_intents
   where author_id = '00000000-0000-0000-0000-0000000ca001'),
  0,
  'Guest cannot see that Host said yes'
);
select ok(
  exists (select 1 from public.hang_again_prompts() where person_name = 'Host'),
  'Guest is asked about Host as if nothing had happened'
);
select is(
  public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca001', true),
  'matched',
  'the second yes is a match'
);

reset role;
select is(
  (select count(*)::int from public.matches
   where user_a = least('00000000-0000-0000-0000-0000000ca001'::uuid, '00000000-0000-0000-0000-0000000ca002'::uuid)
     and user_b = greatest('00000000-0000-0000-0000-0000000ca001'::uuid, '00000000-0000-0000-0000-0000000ca002'::uuid)
     and kind = 'hang_again'),
  1,
  'one match row for the pair'
);
select is(
  (select count(*)::int from public.room_members rm
   join public.matches m on m.room_id = rm.room_id
   where m.kind = 'hang_again'
     and m.user_a = least('00000000-0000-0000-0000-0000000ca001'::uuid, '00000000-0000-0000-0000-0000000ca002'::uuid)),
  2,
  'both of them are in the match room'
);

-- ————————————————————————— a no never matches —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000ca006","role":"authenticated"}', true);
select is(
  public.answer_hang_again('00000000-0000-0000-0000-0000000ce001', '00000000-0000-0000-0000-0000000ca001', true),
  'saved',
  'a yes toward someone who said no just waits, and looks like any other wait'
);

select * from finish();
rollback;
