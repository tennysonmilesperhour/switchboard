-- pgTAP coverage for 20260930070000_moderator_actions.sql (P7, decision D7).
--
-- A room-message report attaches the message, copied from the row rather than
-- from the reporter; only a platform moderator can suspend an account or
-- remove a post or message, and only against an open report about it; a
-- suspension is GoTrue's own ban and the write policies honour it; removed
-- content disappears for members but stays in the report; every action lands
-- in the audit trail, which nobody can write. Every refusal has a positive
-- control beside it.

begin;
select plan(50);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d7001', 'p7-mod@example.com'),
  ('00000000-0000-0000-0000-0000000d7002', 'p7-mod-two@example.com'),
  ('00000000-0000-0000-0000-0000000d7003', 'p7-reporter@example.com'),
  ('00000000-0000-0000-0000-0000000d7004', 'p7-sender@example.com'),
  ('00000000-0000-0000-0000-0000000d7005', 'p7-outsider@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000d7001', 'P7 Mod', true),
  ('00000000-0000-0000-0000-0000000d7002', 'P7 Mod Two', true),
  ('00000000-0000-0000-0000-0000000d7003', 'P7 Reporter', true),
  ('00000000-0000-0000-0000-0000000d7004', 'P7 Sender', true),
  ('00000000-0000-0000-0000-0000000d7005', 'P7 Outsider', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.platform_moderators (member_id) values
  ('00000000-0000-0000-0000-0000000d7001'),
  ('00000000-0000-0000-0000-0000000d7002');

insert into public.rooms (id, kind, title, created_by) values
  ('00000000-0000-0000-0000-0000000d7101', 'event', 'P7 Picnic',
   '00000000-0000-0000-0000-0000000d7003');
insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-0000000d7101', '00000000-0000-0000-0000-0000000d7003'),
  ('00000000-0000-0000-0000-0000000d7101', '00000000-0000-0000-0000-0000000d7004');

insert into public.messages (id, room_id, sender_id, body, image_url) values
  ('00000000-0000-0000-0000-0000000d7201', '00000000-0000-0000-0000-0000000d7101',
   '00000000-0000-0000-0000-0000000d7004', 'something cruel',
   '00000000-0000-0000-0000-0000000d7004/room-cruel.jpg'),
  ('00000000-0000-0000-0000-0000000d7202', '00000000-0000-0000-0000-0000000d7101',
   '00000000-0000-0000-0000-0000000d7004', 'something else cruel', null);
-- What the first message filed into the room's tabs.
insert into public.room_items (id, room_id, message_id, kind, title, url, created_by) values
  ('00000000-0000-0000-0000-0000000d7301', '00000000-0000-0000-0000-0000000d7101',
   '00000000-0000-0000-0000-0000000d7201', 'photo', 'Photo',
   '00000000-0000-0000-0000-0000000d7004/room-cruel.jpg',
   '00000000-0000-0000-0000-0000000d7004'),
  ('00000000-0000-0000-0000-0000000d7302', '00000000-0000-0000-0000-0000000d7101',
   '00000000-0000-0000-0000-0000000d7201', 'task', 'bring something cruel', null,
   '00000000-0000-0000-0000-0000000d7004');

insert into public.boards (id, slug, name, created_by) values
  ('00000000-0000-0000-0000-0000000d7401', 'p7-elm-street', 'Elm Street',
   '00000000-0000-0000-0000-0000000d7003');
insert into public.board_members (board_id, member_id, role) values
  ('00000000-0000-0000-0000-0000000d7401', '00000000-0000-0000-0000-0000000d7003', 'moderator'),
  ('00000000-0000-0000-0000-0000000d7401', '00000000-0000-0000-0000-0000000d7004', 'member');
insert into public.board_posts (id, board_id, author_id, title, body) values
  ('00000000-0000-0000-0000-0000000d7501', '00000000-0000-0000-0000-0000000d7401',
   '00000000-0000-0000-0000-0000000d7004', 'Selling stolen bikes', 'DM me');

set local role authenticated;

-- ————————————————————————— reporting a room message —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7003","role":"authenticated"}', true);

-- The reporter forges the snapshot and names the wrong person; neither sticks.
select lives_ok(
  $$ insert into public.user_reports
       (reporter_id, reported_id, target_kind, message_id, reason,
        snapshot_body, snapshot_image)
     values ('00000000-0000-0000-0000-0000000d7003',
             '00000000-0000-0000-0000-0000000d7005',
             'room_message', '00000000-0000-0000-0000-0000000d7201', 'cruel',
             'something kind', '00000000-0000-0000-0000-0000000d7005/other.jpg') $$,
  'a room member can report a message in their room'
);

select results_eq(
  $$ select reported_id, snapshot_body, snapshot_image from public.user_reports
      where message_id = '00000000-0000-0000-0000-0000000d7201' $$,
  $$ values ('00000000-0000-0000-0000-0000000d7004'::uuid, 'something cruel'::text,
             '00000000-0000-0000-0000-0000000d7004/room-cruel.jpg'::text) $$,
  'the report attaches the message as stored, and names its real sender'
);

select throws_ok(
  $$ insert into public.user_reports (reporter_id, reported_id, target_kind, message_id, reason)
     values ('00000000-0000-0000-0000-0000000d7003',
             '00000000-0000-0000-0000-0000000d7004',
             'room_message', '00000000-0000-0000-0000-0000000d7201', 'again') $$,
  '23505', null,
  'the same person cannot report the same message twice'
);

select lives_ok(
  $$ insert into public.user_reports (reporter_id, reported_id, target_kind, message_id, reason)
     values ('00000000-0000-0000-0000-0000000d7003',
             '00000000-0000-0000-0000-0000000d7004',
             'room_message', '00000000-0000-0000-0000-0000000d7202', 'also cruel') $$,
  'a second message is a second report'
);

select lives_ok(
  $$ insert into public.user_reports (reporter_id, reported_id, target_kind, target_id, reason)
     values ('00000000-0000-0000-0000-0000000d7003',
             '00000000-0000-0000-0000-0000000d7004',
             'board_post', '00000000-0000-0000-0000-0000000d7501', 'stolen goods') $$,
  'a board member can report a post'
);

-- Someone outside the room cannot use a report to read a message.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7005","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.user_reports (reporter_id, reported_id, target_kind, message_id, reason)
     values ('00000000-0000-0000-0000-0000000d7005',
             '00000000-0000-0000-0000-0000000d7004',
             'room_message', '00000000-0000-0000-0000-0000000d7201', 'nosy') $$,
  'P0002', 'message not found',
  'a non-member cannot report (and so copy) a message they cannot read'
);

select throws_ok(
  $$ insert into public.user_reports (reporter_id, reported_id, target_kind, target_id, reason)
     values ('00000000-0000-0000-0000-0000000d7005',
             '00000000-0000-0000-0000-0000000d7004',
             'board_post', '00000000-0000-0000-0000-0000000d7501', 'nosy') $$,
  'P0002', 'post not found',
  'a non-member cannot report (and so copy) a post they cannot read'
);

-- ————————————————————————— nobody else can moderate —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7003","role":"authenticated"}', true);

select throws_ok(
  $$ select public.moderate_remove_room_message('00000000-0000-0000-0000-0000000d7201',
       (select id from public.user_reports where message_id = '00000000-0000-0000-0000-0000000d7201')) $$,
  'not authorized',
  'a non-moderator cannot remove a message, even one they reported'
);

select throws_ok(
  $$ select public.moderate_remove_board_post('00000000-0000-0000-0000-0000000d7501',
       (select id from public.user_reports where target_id = '00000000-0000-0000-0000-0000000d7501')) $$,
  'not authorized',
  'a non-moderator (even the board''s own moderator) cannot remove a post this way'
);

select throws_ok(
  $$ select public.moderate_suspend_account('00000000-0000-0000-0000-0000000d7004',
       (select id from public.user_reports where message_id = '00000000-0000-0000-0000-0000000d7201')) $$,
  'not authorized',
  'a non-moderator cannot suspend anyone'
);

select throws_ok(
  $$ select public.moderate_lift_suspension('00000000-0000-0000-0000-0000000d7004') $$,
  'not authorized',
  'a non-moderator cannot lift a suspension'
);

select is(
  (select count(*)::int from public.list_suspended_accounts()),
  0,
  'a non-moderator sees nobody in the suspended list'
);

select throws_ok(
  $$ insert into public.moderation_actions (moderator_id, action, subject_id)
     values ('00000000-0000-0000-0000-0000000d7003', 'suspend',
             '00000000-0000-0000-0000-0000000d7004') $$,
  '42501', null,
  'nobody can write the audit trail from the API'
);

-- Removal state is not writable by the author, on the way in or afterwards.
select throws_ok(
  $$ insert into public.messages (room_id, sender_id, body, removed_at)
     values ('00000000-0000-0000-0000-0000000d7101',
             '00000000-0000-0000-0000-0000000d7003', 'pre-removed', now()) $$,
  '42501', null,
  'a message cannot be sent already removed'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7004","role":"authenticated"}', true);

select throws_ok(
  $$ update public.board_posts set removed_at = now()
      where id = '00000000-0000-0000-0000-0000000d7501' $$,
  '42501', null,
  'an author cannot write removal state onto their own post'
);

-- The author edits the post after it was flagged; the report keeps the original.
select lives_ok(
  $$ update public.board_posts set title = 'Bikes for sale', body = 'Great prices'
      where id = '00000000-0000-0000-0000-0000000d7501' $$,
  'an author can still edit a post that has not been removed'
);

-- The sender deletes one reported message; its report outlives it.
select lives_ok(
  $$ delete from public.messages where id = '00000000-0000-0000-0000-0000000d7202' $$,
  'a sender can delete their own message while it is only reported'
);

-- ————————————————————————— the moderator's queue —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7001","role":"authenticated"}', true);

select results_eq(
  $$ select target_kind, target_body, target_image, target_exists, room_title
       from public.list_open_reports()
      where target_id = '00000000-0000-0000-0000-0000000d7201' $$,
  $$ values ('room_message'::text, 'something cruel'::text,
             '00000000-0000-0000-0000-0000000d7004/room-cruel.jpg'::text, true, 'P7 Picnic'::text) $$,
  'the queue shows the reported message, its photo path and its room'
);

select results_eq(
  $$ select target_body, target_exists
       from public.list_open_reports()
      where reason = 'also cruel' $$,
  $$ values ('something else cruel'::text, false) $$,
  'a message its sender deleted is still in the queue, as it was said'
);

select results_eq(
  $$ select target_title, target_body
       from public.list_open_reports()
      where target_id = '00000000-0000-0000-0000-0000000d7501' $$,
  $$ values ('Selling stolen bikes'::text, 'DM me'::text) $$,
  'a post report shows the post as it was flagged, not as it was edited'
);

-- ————————————————————————— removing a message —————————————————————————
select throws_ok(
  $$ select public.moderate_remove_room_message('00000000-0000-0000-0000-0000000d7201',
       (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7501')) $$,
  'no open report about this message',
  'a removal must answer a report about that message'
);

select is(
  public.moderate_remove_room_message('00000000-0000-0000-0000-0000000d7201',
    (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7201'),
    'Harassment'),
  'removed',
  'a moderator can remove a reported message'
);

select is(
  public.moderate_remove_room_message('00000000-0000-0000-0000-0000000d7201',
    (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7201')),
  'already_removed',
  'removing it twice changes nothing'
);

select results_eq(
  $$ select action, subject_id, message_id, note from public.moderation_actions
      where report_id = (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7201') $$,
  $$ values ('remove_message'::text, '00000000-0000-0000-0000-0000000d7004'::uuid,
             '00000000-0000-0000-0000-0000000d7201'::uuid, 'Harassment'::text) $$,
  'the removal is recorded against the report, the message and its sender'
);

select is(
  (select moderator_id from public.moderation_actions where action = 'remove_message'),
  '00000000-0000-0000-0000-0000000d7001'::uuid,
  'the audit trail names the moderator who acted'
);

select results_eq(
  $$ select target_body, target_exists, target_removed_at is not null
       from public.list_open_reports()
      where target_id = '00000000-0000-0000-0000-0000000d7201' $$,
  $$ values ('something cruel'::text, true, true) $$,
  'the report still shows what was removed, marked as removed'
);

-- Members of the room no longer see it, nor what it filed.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7003","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.messages
    where id = '00000000-0000-0000-0000-0000000d7201'),
  0,
  'a removed message is hidden from the room'
);

select is(
  (select count(*)::int from public.room_items
    where id in ('00000000-0000-0000-0000-0000000d7301', '00000000-0000-0000-0000-0000000d7302')),
  0,
  'the photo and task it filed into the tabs are gone too'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7004","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.messages
    where id = '00000000-0000-0000-0000-0000000d7201'),
  0,
  'the sender no longer sees their removed message either'
);

delete from public.messages where id = '00000000-0000-0000-0000-0000000d7201';
reset role;
select is(
  (select count(*)::int from public.messages
    where id = '00000000-0000-0000-0000-0000000d7201' and removed_at is not null),
  1,
  'the sender cannot delete a removed message: it is the record'
);

select throws_ok(
  $$ update public.messages set removed_at = null
      where id = '00000000-0000-0000-0000-0000000d7201' $$,
  '42501', null,
  'not even the service role can undo a removal outside the moderator functions'
);

-- ————————————————————————— removing a post —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7001","role":"authenticated"}', true);

select is(
  public.moderate_remove_board_post('00000000-0000-0000-0000-0000000d7501',
    (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7501')),
  'removed',
  'a moderator can remove a reported board post'
);

select results_eq(
  $$ select action, subject_id, post_id from public.moderation_actions
      where action = 'remove_post' $$,
  $$ values ('remove_post'::text, '00000000-0000-0000-0000-0000000d7004'::uuid,
             '00000000-0000-0000-0000-0000000d7501'::uuid) $$,
  'the post removal is recorded against its author and the post'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7003","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.board_posts
    where id = '00000000-0000-0000-0000-0000000d7501'),
  0,
  'a removed post is hidden from the board'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7004","role":"authenticated"}', true);

update public.board_posts set title = 'Nothing to see'
 where id = '00000000-0000-0000-0000-0000000d7501';
reset role;
select is(
  (select title from public.board_posts where id = '00000000-0000-0000-0000-0000000d7501'),
  'Bikes for sale',
  'the author cannot edit a removed post'
);

-- ————————————————————————— suspending —————————————————————————
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7001","role":"authenticated"}', true);

select throws_ok(
  $$ select public.moderate_suspend_account('00000000-0000-0000-0000-0000000d7005',
       (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7501')) $$,
  'no open report about this account',
  'a suspension must answer an open report about that account'
);

select is(
  public.moderate_suspend_account('00000000-0000-0000-0000-0000000d7004',
    (select id from public.list_open_reports() where target_id = '00000000-0000-0000-0000-0000000d7201'),
    7, 'Harassment in a plan room'),
  'suspended',
  'a moderator can suspend a reported account'
);

reset role;
select ok(
  (select banned_until between now() + interval '6 days 23 hours' and now() + interval '7 days 1 hour'
     from auth.users where id = '00000000-0000-0000-0000-0000000d7004'),
  'the suspension is GoTrue''s own ban, for the chosen number of days'
);

select is(
  private.is_suspended('00000000-0000-0000-0000-0000000d7004'),
  true,
  'the database sees the account as suspended'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7001","role":"authenticated"}', true);

select results_eq(
  $$ select member_id, note from public.list_suspended_accounts() $$,
  $$ values ('00000000-0000-0000-0000-0000000d7004'::uuid, 'Harassment in a plan room'::text) $$,
  'moderators can see who is suspended, and why'
);

select is(
  (select reported_suspended_until is not null from public.list_open_reports()
    where target_id = '00000000-0000-0000-0000-0000000d7501'),
  true,
  'the queue shows that the reported account is suspended'
);

-- A token issued before the suspension cannot add what moderators remove.
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7004","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.messages (room_id, sender_id, body)
     values ('00000000-0000-0000-0000-0000000d7101',
             '00000000-0000-0000-0000-0000000d7004', 'still here') $$,
  '42501', null,
  'a suspended account cannot send a room message'
);

select throws_ok(
  $$ insert into public.board_posts (board_id, author_id, title)
     values ('00000000-0000-0000-0000-0000000d7401',
             '00000000-0000-0000-0000-0000000d7004', 'still here') $$,
  '42501', null,
  'a suspended account cannot post to a board'
);

-- Moderators cannot suspend themselves or each other.
reset role;
insert into public.user_reports (reporter_id, reported_id, reason) values
  ('00000000-0000-0000-0000-0000000d7003', '00000000-0000-0000-0000-0000000d7002', 'bossy'),
  ('00000000-0000-0000-0000-0000000d7003', '00000000-0000-0000-0000-0000000d7001', 'also bossy');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7001","role":"authenticated"}', true);

select is(
  public.moderate_suspend_account('00000000-0000-0000-0000-0000000d7001',
    (select id from public.list_open_reports() where reason = 'also bossy')),
  'self',
  'a moderator cannot suspend themselves'
);

select is(
  public.moderate_suspend_account('00000000-0000-0000-0000-0000000d7002',
    (select id from public.list_open_reports() where reason = 'bossy')),
  'moderator',
  'one moderator cannot suspend another'
);

-- ————————————————————————— lifting —————————————————————————
select is(
  public.moderate_lift_suspension('00000000-0000-0000-0000-0000000d7004', 'Appeal upheld'),
  'lifted',
  'a moderator can lift a suspension'
);

select is(
  public.moderate_lift_suspension('00000000-0000-0000-0000-0000000d7004'),
  'not_suspended',
  'lifting it twice changes nothing'
);

select is(
  (select count(*)::int from public.moderation_actions
    where subject_id = '00000000-0000-0000-0000-0000000d7004'
      and action in ('suspend', 'lift_suspension')),
  2,
  'the suspension and its lifting are both on the record'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000d7004","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.messages (room_id, sender_id, body)
     values ('00000000-0000-0000-0000-0000000d7101',
             '00000000-0000-0000-0000-0000000d7004', 'sorry') $$,
  'once lifted, the account can write again'
);

select is(
  (select count(*)::int from public.moderation_actions),
  0,
  'an ordinary member cannot read the audit trail'
);

select * from finish();
rollback;
