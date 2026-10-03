-- pgTAP coverage for 20261003010000_cohost_counts_as_going.sql.
--
-- Making someone a co-host puts their open invitation down as going, through
-- the same rules an RSVP follows, and only at the primary host's request.
--
--   supabase test db

begin;
select plan(9);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0601', 'cg-host@example.com'),
  ('00000000-0000-0000-0000-0000000c0602', 'cg-cohost@example.com'),
  ('00000000-0000-0000-0000-0000000c0603', 'cg-guest@example.com'),
  ('00000000-0000-0000-0000-0000000c0604', 'cg-minor@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000c0601', 'Host', true),
  ('00000000-0000-0000-0000-0000000c0602', 'Cohost', true),
  ('00000000-0000-0000-0000-0000000c0603', 'Guest', true),
  ('00000000-0000-0000-0000-0000000c0604', 'Minor', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

-- An open plan, a full plan, and a plan on a guardian hold.
insert into public.events (id, host_id, title, status, capacity, parental_approval) values
  ('00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0601', 'Open', 'inviting', 4, false),
  ('00000000-0000-0000-0000-0000000ec602', '00000000-0000-0000-0000-0000000c0601', 'Full', 'inviting', 1, false),
  ('00000000-0000-0000-0000-0000000ec603', '00000000-0000-0000-0000-0000000c0601', 'Held', 'inviting', 4, true);

insert into public.invites (id, event_id, invitee_id, position, status, sent_at) values
  ('00000000-0000-0000-0000-0000000ac601', '00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0602', 0, 'sent', now()),
  ('00000000-0000-0000-0000-0000000ac602', '00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0603', 1, 'sent', now()),
  ('00000000-0000-0000-0000-0000000ac603', '00000000-0000-0000-0000-0000000ec602', '00000000-0000-0000-0000-0000000c0603', 0, 'accepted', now()),
  ('00000000-0000-0000-0000-0000000ac604', '00000000-0000-0000-0000-0000000ec602', '00000000-0000-0000-0000-0000000c0602', 1, 'sent', now()),
  ('00000000-0000-0000-0000-0000000ac605', '00000000-0000-0000-0000-0000000ec603', '00000000-0000-0000-0000-0000000c0604', 0, 'sent', now());

insert into public.event_cohosts (event_id, cohost_id, added_by) values
  ('00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0602', '00000000-0000-0000-0000-0000000c0601'),
  ('00000000-0000-0000-0000-0000000ec602', '00000000-0000-0000-0000-0000000c0602', '00000000-0000-0000-0000-0000000c0601'),
  ('00000000-0000-0000-0000-0000000ec603', '00000000-0000-0000-0000-0000000c0604', '00000000-0000-0000-0000-0000000c0601');

-- ————————————————————————— not the host —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000c0602","role":"authenticated"}', true);

select throws_ok(
  $$ select public.accept_cohost_invite('00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0602') $$,
  '42501', null,
  'a co-host cannot accept on their own behalf through this door'
);

-- ————————————————————————— the host —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000c0601","role":"authenticated"}', true);

select throws_ok(
  $$ select public.accept_cohost_invite('00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0603') $$,
  '42501', null,
  'the host cannot accept for a guest who is not a co-host'
);

select is(
  public.accept_cohost_invite('00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0602'),
  'accepted',
  'a co-host with an open invitation is put down as going'
);
select is(
  public.accept_cohost_invite('00000000-0000-0000-0000-0000000ec601', '00000000-0000-0000-0000-0000000c0602'),
  'no_open_invite',
  'asking again changes nothing'
);
select is(
  public.accept_cohost_invite('00000000-0000-0000-0000-0000000ec602', '00000000-0000-0000-0000-0000000c0602'),
  'full',
  'a full plan is left alone rather than waitlisting a co-host who never asked'
);
select is(
  public.accept_cohost_invite('00000000-0000-0000-0000-0000000ec603', '00000000-0000-0000-0000-0000000c0604'),
  'sent',
  'a guardian hold is never skipped'
);

reset role;
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000ac601'),
  'accepted', 'the open plan''s invitation is accepted'
);
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000ac604'),
  'sent', 'the full plan''s invitation is untouched'
);
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000ac605'),
  'sent', 'the held plan''s invitation is untouched'
);

select * from finish();
rollback;
