-- pgTAP coverage for 20260930022000_split_the_bill.sql.
--
-- The payer is pinned to the room, shares always add up to the amount, only
-- the logger or the payer may change an expense, the ledger is written only by
-- definer code, settling touches exactly one pair, and a block closes the
-- ledger of a two-person room the same way it closes its chat.

begin;
select plan(15);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a301', 'split-alex@example.com'),
  ('00000000-0000-0000-0000-00000000a302', 'split-sam@example.com'),
  ('00000000-0000-0000-0000-00000000a303', 'split-jo@example.com'),
  ('00000000-0000-0000-0000-00000000a304', 'split-outsider@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a301', 'Alex', true),
  ('00000000-0000-0000-0000-00000000a302', 'Sam', true),
  ('00000000-0000-0000-0000-00000000a303', 'Jo', true),
  ('00000000-0000-0000-0000-00000000a304', 'Outsider', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-00000000b301', 'event', 'Cabin weekend', '00000000-0000-0000-0000-00000000a301'),
  ('00000000-0000-0000-0000-00000000b302', 'match', 'Dinner', '00000000-0000-0000-0000-00000000a301');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a301'),
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a302'),
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a303'),
  ('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000a301'),
  ('00000000-0000-0000-0000-00000000b302', '00000000-0000-0000-0000-00000000a304');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000a304', '00000000-0000-0000-0000-00000000a301');

set local role authenticated;

-- ————————————————————————— G3: the payer is pinned —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a301","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.expenses (room_id, description, amount_cents, payer_id, created_by)
     values ('00000000-0000-0000-0000-00000000b301', 'Groceries', 3000,
             '00000000-0000-0000-0000-00000000a304', '00000000-0000-0000-0000-00000000a301') $$,
  '42501',
  null,
  'nobody can log that someone outside the room paid'
);

select lives_ok(
  $$ insert into public.expenses (id, room_id, description, amount_cents, payer_id, created_by)
     values ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000b301',
             'Firewood', 3001, '00000000-0000-0000-0000-00000000a302',
             '00000000-0000-0000-0000-00000000a301') $$,
  'a member can log what another member of the room paid (D21)'
);

select is(
  (select count(*)::int || ':' || sum(share_cents)::int from public.expense_shares
    where expense_id = '00000000-0000-0000-0000-00000000f301'),
  '3:3001',
  'a direct insert is split across the whole room, and the odd cents are not lost'
);

-- ————————————————————————— G31: participants —————————————————————————
select lives_ok(
  $$ select public.save_expense(
       '00000000-0000-0000-0000-00000000b301', 'Gas', 1001,
       '00000000-0000-0000-0000-00000000a301',
       array['00000000-0000-0000-0000-00000000a301',
             '00000000-0000-0000-0000-00000000a302']::uuid[],
       '00000000-0000-0000-0000-00000000f301'::uuid) $$,
  'the person who logged an expense can re-split it between chosen people'
);

select is(
  (select array_agg(share_cents order by member_id) from public.expense_shares
    where expense_id = '00000000-0000-0000-0000-00000000f301'),
  array[501, 500],
  'only the chosen people carry a share, and the shares sum to the amount'
);

select throws_ok(
  $$ select public.save_expense(
       '00000000-0000-0000-0000-00000000b301', 'Gas', 1001,
       '00000000-0000-0000-0000-00000000a301',
       array['00000000-0000-0000-0000-00000000a304']::uuid[]) $$,
  '42501',
  null,
  'someone outside the room cannot be put on the bill'
);

select throws_ok(
  $$ insert into public.expense_shares (expense_id, room_id, member_id, share_cents)
     values ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000b301',
             '00000000-0000-0000-0000-00000000a303', 1) $$,
  '42501',
  null,
  'shares are written only by the ledger functions'
);

-- ————————————————————————— edit rights —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a303","role":"authenticated"}', true);

select throws_ok(
  $$ select public.save_expense(
       '00000000-0000-0000-0000-00000000b301', 'Gas', 1,
       '00000000-0000-0000-0000-00000000a303',
       array['00000000-0000-0000-0000-00000000a303']::uuid[],
       '00000000-0000-0000-0000-00000000f301'::uuid) $$,
  '42501',
  null,
  'a member who neither logged nor paid cannot rewrite an expense'
);

select is(
  (select count(*)::int from public.expenses
    where id = '00000000-0000-0000-0000-00000000f301'
      and amount_cents = 1001),
  1,
  'and the expense is unchanged'
);

-- ————————————————————————— settling up —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a302","role":"authenticated"}', true);

select is(
  public.settle_up('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000a301'),
  1,
  'Sam settles what they owed Alex for the gas'
);

select is(
  (select settled_at is not null from public.expense_shares
    where expense_id = '00000000-0000-0000-0000-00000000f301'
      and member_id = '00000000-0000-0000-0000-00000000a302'),
  true,
  'Sam''s share is marked settled'
);

select is(
  (select settled_at is null from public.expense_shares
    where expense_id = '00000000-0000-0000-0000-00000000f301'
      and member_id = '00000000-0000-0000-0000-00000000a301'),
  true,
  'nobody else''s share moves'
);

-- ————————————————————————— outsiders and blocks —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a304","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.expense_shares
    where room_id = '00000000-0000-0000-0000-00000000b301'),
  0,
  'someone outside the room reads none of its shares'
);

select throws_ok(
  $$ insert into public.expenses (room_id, description, amount_cents, payer_id, created_by)
     values ('00000000-0000-0000-0000-00000000b302', 'Dinner', 4000,
             '00000000-0000-0000-0000-00000000a304', '00000000-0000-0000-0000-00000000a304') $$,
  '42501',
  null,
  'a block closes a two-person room''s ledger'
);

select throws_ok(
  $$ select public.save_expense(
       '00000000-0000-0000-0000-00000000b302', 'Dinner', 4000,
       '00000000-0000-0000-0000-00000000a304',
       array['00000000-0000-0000-0000-00000000a304']::uuid[]) $$,
  '42501',
  null,
  'including through the ledger function'
);

select * from finish();
rollback;
