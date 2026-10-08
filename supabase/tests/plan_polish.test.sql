-- pgTAP coverage for 20260930060000_plan_polish.sql.
--
--   G20       turning down an Open Table request: host or co-host only, only a
--             request still waiting, and the caller learns whose it was.
--   G21 / D17 a live invitation's window can be lengthened while the plan is
--             inviting (never shortened, never revived); a no can become a yes
--             while the plan is inviting, but a guardian's no stays a no and a
--             guardian plan still holds the yes.
--   G22 / D18 parental approval and recurrence cannot be changed from the
--             browser; the fields the edit form does change still can.
--   G28       only people who went, the host and co-hosts write the capsule.
--
--   supabase test db

begin;
select plan(42);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000f6001', 'polish-host@example.com'),
  ('00000000-0000-0000-0000-0000000f6002', 'polish-cohost@example.com'),
  ('00000000-0000-0000-0000-0000000f6003', 'polish-guest@example.com'),
  ('00000000-0000-0000-0000-0000000f6004', 'polish-requester@example.com'),
  ('00000000-0000-0000-0000-0000000f6005', 'polish-decliner@example.com'),
  ('00000000-0000-0000-0000-0000000f6006', 'polish-minor@example.com'),
  ('00000000-0000-0000-0000-0000000f6007', 'polish-stranger@example.com'),
  ('00000000-0000-0000-0000-0000000f6008', 'polish-second-requester@example.com');

-- These are fully registered RSVP participants; eligibility refusals have separate tests.
update public.profiles set onboarded = true, legal_terms_version = '2026-08-31'
where id in ('00000000-0000-0000-0000-0000000f6001', '00000000-0000-0000-0000-0000000f6002', '00000000-0000-0000-0000-0000000f6003', '00000000-0000-0000-0000-0000000f6004', '00000000-0000-0000-0000-0000000f6005', '00000000-0000-0000-0000-0000000f6006', '00000000-0000-0000-0000-0000000f6007', '00000000-0000-0000-0000-0000000f6008');

-- One plan with invitations going out, a co-host, and an Open Table.
insert into public.events (id, host_id, title, status, invite_mode, capacity, open_table,
                           recurrence, starts_at)
values
  ('00000000-0000-0000-0000-0000000f6e01', '00000000-0000-0000-0000-0000000f6001',
   'Polish plan', 'inviting', 'group', 10, true, 'none', now() + interval '3 days'),
  -- Confirmed: the list is locked, so no windows move and no nos turn to yes.
  ('00000000-0000-0000-0000-0000000f6e02', '00000000-0000-0000-0000-0000000f6001',
   'Locked plan', 'confirmed', 'group', null, false, 'none', now() + interval '3 days'),
  -- Needs a guardian's OK for every yes.
  ('00000000-0000-0000-0000-0000000f6e03', '00000000-0000-0000-0000-0000000f6001',
   'Youth plan', 'inviting', 'group', null, false, 'weekly', now() + interval '3 days');
update public.events set parental_approval = true
 where id = '00000000-0000-0000-0000-0000000f6e03';

insert into public.event_cohosts (event_id, cohost_id, added_by) values
  ('00000000-0000-0000-0000-0000000f6e01', '00000000-0000-0000-0000-0000000f6002',
   '00000000-0000-0000-0000-0000000f6001');

insert into public.invites
  (id, event_id, invitee_id, position, group_stage, status, sent_at, window_minutes, decline_note, decline_message)
values
  -- A live invitation, one hour into a two-hour window.
  ('00000000-0000-0000-0000-0000000f6a01', '00000000-0000-0000-0000-0000000f6e01',
   '00000000-0000-0000-0000-0000000f6003', 0, 0, 'sent', now() - interval '1 hour', 120, null, null),
  -- Two Open Table requests.
  ('00000000-0000-0000-0000-0000000f6a02', '00000000-0000-0000-0000-0000000f6e01',
   '00000000-0000-0000-0000-0000000f6004', 1, 999, 'requested', null, 1440, null, null),
  ('00000000-0000-0000-0000-0000000f6a03', '00000000-0000-0000-0000-0000000f6e01',
   '00000000-0000-0000-0000-0000000f6008', 2, 999, 'requested', null, 1440, null, null),
  -- Somebody who said no, with a note for the host.
  ('00000000-0000-0000-0000-0000000f6a04', '00000000-0000-0000-0000-0000000f6e01',
   '00000000-0000-0000-0000-0000000f6005', 3, 0, 'declined', now() - interval '2 hours', 120,
   'keep_asking', 'Out of town, sorry'),
  -- Still in line.
  ('00000000-0000-0000-0000-0000000f6a05', '00000000-0000-0000-0000-0000000f6e01',
   '00000000-0000-0000-0000-0000000f6007', 4, 1, 'queued', null, 60, null, null),
  -- A live invitation whose window ran out before the sweep got to it.
  ('00000000-0000-0000-0000-0000000f6a06', '00000000-0000-0000-0000-0000000f6e02',
   '00000000-0000-0000-0000-0000000f6003', 0, 0, 'sent', now() - interval '3 hours', 60, null, null),
  -- A no on the confirmed plan.
  ('00000000-0000-0000-0000-0000000f6a07', '00000000-0000-0000-0000-0000000f6e02',
   '00000000-0000-0000-0000-0000000f6005', 1, 0, 'declined', now() - interval '3 hours', 60, null, null),
  -- On the youth plan: a no that was the guardian's, and one that was the
  -- invitee's own.
  ('00000000-0000-0000-0000-0000000f6a08', '00000000-0000-0000-0000-0000000f6e03',
   '00000000-0000-0000-0000-0000000f6006', 0, 0, 'declined', now() - interval '1 day', 1440, null, null),
  ('00000000-0000-0000-0000-0000000f6a09', '00000000-0000-0000-0000-0000000f6e03',
   '00000000-0000-0000-0000-0000000f6005', 1, 0, 'declined', now() - interval '1 day', 1440, null, null);

-- A no on the youth plan after an old denial and a newer request: the latest
-- request is not a no, so the no is the invitee's own.
insert into public.invites
  (id, event_id, invitee_id, position, group_stage, status, sent_at, window_minutes)
values
  ('00000000-0000-0000-0000-0000000f6a10', '00000000-0000-0000-0000-0000000f6e03',
   '00000000-0000-0000-0000-0000000f6007', 2, 0, 'declined', now() - interval '1 day', 1440);

insert into public.parental_approvals (invite_id, event_id, guardian_email, status, responded_at, created_at)
values
  ('00000000-0000-0000-0000-0000000f6a08', '00000000-0000-0000-0000-0000000f6e03',
   'parent@example.com', 'denied', now(), now()),
  ('00000000-0000-0000-0000-0000000f6a10', '00000000-0000-0000-0000-0000000f6e03',
   'other-parent@example.com', 'denied', now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-0000-0000-0000000f6a10', '00000000-0000-0000-0000-0000000f6e03',
   'other-parent@example.com', 'pending', null, now() - interval '1 day');

-- ————————————————————————— G20: turning down a request —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.decline_join_request('00000000-0000-0000-0000-0000000f6a02') $$,
  'P0001', 'host only',
  'a guest on the plan cannot turn a request down'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6001","role":"authenticated"}', true);
select is(
  public.decline_join_request('00000000-0000-0000-0000-0000000f6a02'),
  '00000000-0000-0000-0000-0000000f6004'::uuid,
  'the host turns a request down and learns whose it was, so they can be told'
);
select is(
  (select count(*)::int from public.invites where id = '00000000-0000-0000-0000-0000000f6a02'),
  0,
  'the request is gone, so the requester keeps no view of the plan'
);
select is(
  public.decline_join_request('00000000-0000-0000-0000-0000000f6a02'),
  null::uuid,
  'turning down a request that is already answered changes nothing and names nobody'
);
select is(
  public.decline_join_request('00000000-0000-0000-0000-0000000f6a01'),
  null::uuid,
  'a live invitation is not a request, and cannot be deleted through this door'
);
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000f6a01'),
  'sent',
  'the invitation is untouched'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6002","role":"authenticated"}', true);
select is(
  public.decline_join_request('00000000-0000-0000-0000-0000000f6a03'),
  '00000000-0000-0000-0000-0000000f6008'::uuid,
  'a co-host answers requests like the host does'
);

-- ————————————————————————— G21: more time for a live invitation —————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6001","role":"authenticated"}', true);
select lives_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a01', 240) $$,
  'the host gives a live invitation more time while the plan is inviting'
);
select is(
  (select window_minutes from public.invites where id = '00000000-0000-0000-0000-0000000f6a01'),
  240,
  'the longer window is stored'
);
select throws_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a01', 90) $$,
  'P0001', 'a live invitation can only be given more time',
  'a live window is never shortened under someone still deciding'
);
select throws_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a06', 600) $$,
  'P0001', 'windows can only be extended while invitations are going out',
  'a confirmed plan''s windows stay as they are'
);
select throws_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a04', 600) $$,
  'P0001', 'only an invitation still waiting on an answer can be re-timed',
  'an answered invitation has no window to extend'
);
select lives_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a05', 15) $$,
  'a queued invitation is re-timed as before, shorter included'
);

-- A window that ran out on an inviting plan is not revived.
reset role;
update public.invites
   set sent_at = now() - interval '5 hours'
 where id = '00000000-0000-0000-0000-0000000f6a01';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6001","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a01', 600) $$,
  'P0001', 'this invitation''s window has already run out',
  'a window that has run out is not reopened (Resend does that)'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6002","role":"authenticated"}', true);
reset role;
update public.invites
   set sent_at = now() - interval '10 minutes'
 where id = '00000000-0000-0000-0000-0000000f6a01';
set local role authenticated;
select lives_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a01', 480) $$,
  'a co-host can give more time too'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_invite_window('00000000-0000-0000-0000-0000000f6a01', 960) $$,
  'P0001', 'not authorized',
  'the invitee cannot extend their own window'
);

-- ————————————————————————— G21: a no that becomes a yes —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6005","role":"authenticated"}', true);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-0000000f6a04', false),
  'declined',
  'saying no twice records nothing new'
);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-0000000f6a04', true),
  'accepted',
  'someone who said no can say yes while the plan is inviting'
);
select is(
  (select decline_note || coalesce(decline_message, '') from public.invites
    where id = '00000000-0000-0000-0000-0000000f6a04'),
  null::text,
  'the yes leaves no "ask me again" or decline note behind for the host'
);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-0000000f6a07', true),
  'declined',
  'once the list is confirmed, a no stays a no'
);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-0000000f6a09', true),
  'pending_approval',
  'on a guardian plan a changed mind is held for the guardian like any yes'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6006","role":"authenticated"}', true);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-0000000f6a08', true),
  'declined',
  'a guardian''s no is not the invitee''s to take back'
);
select is(
  (select status from public.invites where id = '00000000-0000-0000-0000-0000000f6a08'),
  'declined',
  'the guardian''s no stands'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6007","role":"authenticated"}', true);
select is(
  public.respond_to_invite('00000000-0000-0000-0000-0000000f6a10', true),
  'pending_approval',
  'an older guardian no does not outlast a newer request: the latest one decides'
);
select is(
  (select count(*)::int from public.invites
    where id = '00000000-0000-0000-0000-0000000f6a10' and status = 'accepted'),
  0,
  'and the changed mind is still held for the guardian, never counted outright'
);

-- ————————————————————————— G22 / D18: what stays fixed —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6001","role":"authenticated"}', true);
select throws_ok(
  $$ update public.events set parental_approval = false
      where id = '00000000-0000-0000-0000-0000000f6e03' $$,
  'P0001', 'parental approval and recurrence are set when a plan is made',
  'the host cannot switch off guardian approval after people said yes under it'
);
select throws_ok(
  $$ update public.events set recurrence = 'none'
      where id = '00000000-0000-0000-0000-0000000f6e03' $$,
  'P0001', 'parental approval and recurrence are set when a plan is made',
  'recurrence is fixed too'
);
select lives_ok(
  $$ update public.events
        set theme = 'dusk', reminders_enabled = false, open_table = false,
            cover_url = 'https://example.com/cover.jpg'
      where id = '00000000-0000-0000-0000-0000000f6e01' $$,
  'the fields the edit form changes still change'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6002","role":"authenticated"}', true);
select throws_ok(
  $$ update public.events set parental_approval = true
      where id = '00000000-0000-0000-0000-0000000f6e01' $$,
  'P0001', 'parental approval and recurrence are set when a plan is made',
  'a co-host cannot change the plan''s founding rules either'
);

reset role;
select lives_ok(
  $$ update public.events set recurrence = 'monthly'
      where id = '00000000-0000-0000-0000-0000000f6e02' $$,
  'server-side roles can still correct them'
);

-- ————————————————————————— G28: who writes the capsule —————————————————————————
-- The live invitation (a01) becomes a yes; the decliner on the confirmed plan
-- (a07) stays a no.
update public.invites set status = 'accepted'
 where id = '00000000-0000-0000-0000-0000000f6a06';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6003","role":"authenticated"}', true);
select ok(
  public.can_current_user_add_to_capsule('00000000-0000-0000-0000-0000000f6e02'),
  'someone who went may add to the capsule'
);
select lives_ok(
  $$ insert into public.capsule_entries (event_id, user_id, line)
     values ('00000000-0000-0000-0000-0000000f6e02',
             '00000000-0000-0000-0000-0000000f6003', 'Best night') $$,
  'a guest who went adds their line'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6005","role":"authenticated"}', true);
select ok(
  not public.can_current_user_add_to_capsule('00000000-0000-0000-0000-0000000f6e02'),
  'someone who declined may not'
);
select throws_ok(
  $$ insert into public.capsule_entries (event_id, user_id, line)
     values ('00000000-0000-0000-0000-0000000f6e02',
             '00000000-0000-0000-0000-0000000f6005', 'Wish I had been there') $$,
  '42501', null,
  'a line from someone who declined is refused by the database'
);
select is(
  (select count(*)::int from public.capsule_entries
    where event_id = '00000000-0000-0000-0000-0000000f6e02'),
  1,
  'someone who declined can still read the capsule of a plan they can see'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6007","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.capsule_entries (event_id, user_id, line)
     values ('00000000-0000-0000-0000-0000000f6e02',
             '00000000-0000-0000-0000-0000000f6007', 'Hello') $$,
  '42501', null,
  'a stranger cannot write to the capsule'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6001","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.capsule_entries (event_id, user_id, line)
     values ('00000000-0000-0000-0000-0000000f6e02',
             '00000000-0000-0000-0000-0000000f6001', 'Thanks for coming') $$,
  'the host adds a line to their own plan'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6002","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.capsule_entries (event_id, user_id, line)
     values ('00000000-0000-0000-0000-0000000f6e01',
             '00000000-0000-0000-0000-0000000f6002', 'Co-hosting was fun') $$,
  'a co-host adds a line to the plan they ran'
);

-- A line written while going cannot be rewritten after backing out.
reset role;
update public.invites set status = 'cancelled'
 where id = '00000000-0000-0000-0000-0000000f6a06';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000f6003","role":"authenticated"}', true);
select throws_ok(
  $$ update public.capsule_entries set line = 'Rewritten'
      where event_id = '00000000-0000-0000-0000-0000000f6e02'
        and user_id = '00000000-0000-0000-0000-0000000f6003' $$,
  '42501', null,
  'the update path holds the same rule as the insert'
);

-- ————————————————————————— privileges —————————————————————————
reset role;
select ok(
  not has_function_privilege('anon', 'public.decline_join_request(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.can_current_user_add_to_capsule(uuid)', 'EXECUTE'),
  'anonymous callers reach neither new function'
);
select ok(
  has_function_privilege('authenticated', 'public.decline_join_request(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'private.decline_join_request(uuid)', 'EXECUTE'),
  'a signed-in host can reach the wrapper and the body it delegates to'
);
select ok(
  has_function_privilege('authenticated', 'private.can_add_to_capsule(uuid, uuid)', 'EXECUTE'),
  'the capsule policies can evaluate their helper as the signed-in writer'
);

select * from finish();
rollback;
