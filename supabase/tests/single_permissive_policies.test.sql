-- pgTAP coverage for 20260930090000_single_permissive_policies.sql (Q3).
--
-- No public table has two permissive policies for the same role and command,
-- counting a FOR ALL policy as all four commands. Postgres ORs permissive
-- policies and evaluates each on every row, so a second one is a cost on every
-- read; fold the rule into the existing policy instead. The behaviour checks
-- below prove the merge kept what each person may see and change.

begin;
select plan(9);

select is(
  (with p as (
     select tablename, policyname, r.role, c.cmd
       from pg_policies pp
       cross join lateral unnest(pp.roles) as r(role)
       cross join lateral unnest(
         case when pp.cmd = 'ALL' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
              else array[pp.cmd] end
       ) as c(cmd)
      where pp.schemaname = 'public' and pp.permissive = 'PERMISSIVE'
   )
   select coalesce(string_agg(tablename || ' ' || role || ' ' || cmd, ', '), '')
     from (select tablename, role, cmd from p group by 1, 2, 3 having count(*) > 1) dup),
  '',
  'no public table has two permissive policies for one role and command'
);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000e901', 'q3-owner@example.com'),
  ('00000000-0000-0000-0000-00000000e902', 'q3-member@example.com'),
  ('00000000-0000-0000-0000-00000000e903', 'q3-stranger@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000e901', 'Q3 Owner', true),
  ('00000000-0000-0000-0000-00000000e902', 'Q3 Member', true),
  ('00000000-0000-0000-0000-00000000e903', 'Q3 Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;
insert into public.connections (requester_id, addressee_id, status) values
  ('00000000-0000-0000-0000-00000000e901', '00000000-0000-0000-0000-00000000e902', 'accepted');
insert into public.households (id, owner_id, name) values
  ('00000000-0000-0000-0000-00000000e9a1', '00000000-0000-0000-0000-00000000e901', 'Q3 Home');
insert into public.household_members (household_id, member_id) values
  ('00000000-0000-0000-0000-00000000e9a1', '00000000-0000-0000-0000-00000000e902');
insert into public.availability_signals (id, user_id, emoji, label, expires_at) values
  ('00000000-0000-0000-0000-00000000e9b1', '00000000-0000-0000-0000-00000000e901',
   '☕', 'Coffee', now() + interval '2 hours');

set local role authenticated;

-- ————————————————————————— the owner —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e901","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.availability_signals
    where id = '00000000-0000-0000-0000-00000000e9b1'),
  1,
  'you still see your own signal'
);
select is(
  (select count(*)::int from public.household_members
    where household_id = '00000000-0000-0000-0000-00000000e9a1'),
  1,
  'an owner still sees their household''s members'
);
select lives_ok(
  $$ update public.households set name = 'Q3 House'
      where id = '00000000-0000-0000-0000-00000000e9a1' $$,
  'an owner can still rename their household'
);

-- ————————————————————————— a member —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e902","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.availability_signals
    where id = '00000000-0000-0000-0000-00000000e9b1'),
  1,
  'a connection still sees a signal shared with everyone'
);
select is(
  (select count(*)::int from public.households
    where id = '00000000-0000-0000-0000-00000000e9a1'),
  1,
  'a member still sees the household'
);
select is_empty(
  $$ update public.households set name = 'Taken over'
      where id = '00000000-0000-0000-0000-00000000e9a1' returning id $$,
  'a member still cannot rename it'
);

-- ————————————————————————— a stranger —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000e903","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.availability_signals
    where id = '00000000-0000-0000-0000-00000000e9b1'),
  0,
  'a stranger still sees no signal'
);
select is(
  (select count(*)::int from public.household_members
    where household_id = '00000000-0000-0000-0000-00000000e9a1'),
  0,
  'or anyone''s household'
);

select * from finish();
rollback;
