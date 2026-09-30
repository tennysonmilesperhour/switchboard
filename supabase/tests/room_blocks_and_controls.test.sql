-- pgTAP coverage for 20260930020000_room_blocks_and_controls.sql and
-- 20260930021000_private_room_photos.sql.
--
-- A block closes a two-person room for both people and leaves group rooms
-- working; membership rows cannot be moved into another room; mute and leave
-- follow D20; the inbox reads each room's own latest message; and a room
-- photo can only ever point at the writer's own upload folder. Every refusal
-- has a positive control beside it.

begin;
select plan(22);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a201', 'room-blocker@example.com'),
  ('00000000-0000-0000-0000-00000000a202', 'room-blocked@example.com'),
  ('00000000-0000-0000-0000-00000000a203', 'room-bystander@example.com');
insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-00000000a201', 'Blocker', true),
  ('00000000-0000-0000-0000-00000000a202', 'Blocked', true),
  ('00000000-0000-0000-0000-00000000a203', 'Bystander', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.rooms (id, kind, title, created_by) values
  -- A match room between the pair that is about to be blocked.
  ('00000000-0000-0000-0000-00000000b201', 'match', 'Coffee', '00000000-0000-0000-0000-00000000a201'),
  -- A plan's Living Room all three are in.
  ('00000000-0000-0000-0000-00000000b202', 'event', 'Picnic', '00000000-0000-0000-0000-00000000a201'),
  -- A match room between the blocker and someone else entirely.
  ('00000000-0000-0000-0000-00000000b203', 'match', 'Climbing', '00000000-0000-0000-0000-00000000a201');

insert into public.room_members (room_id, member_id) values
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000a202'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000a202'),
  ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000a203'),
  ('00000000-0000-0000-0000-00000000b203', '00000000-0000-0000-0000-00000000a201'),
  ('00000000-0000-0000-0000-00000000b203', '00000000-0000-0000-0000-00000000a203');

insert into public.events (id, host_id, title, status, room_id) values
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000a201',
   'Picnic', 'inviting', '00000000-0000-0000-0000-00000000b202');

-- Said before the block.
insert into public.messages (id, room_id, sender_id, body, created_at) values
  ('00000000-0000-0000-0000-00000000d201', '00000000-0000-0000-0000-00000000b201',
   '00000000-0000-0000-0000-00000000a201', 'See you at 10?', now() - interval '1 day');
insert into public.room_items (id, room_id, kind, title, created_by) values
  ('00000000-0000-0000-0000-00000000e201', '00000000-0000-0000-0000-00000000b201',
   'task', 'bring snacks', '00000000-0000-0000-0000-00000000a201');

insert into public.profile_blocks (blocker_id, blocked_id) values
  ('00000000-0000-0000-0000-00000000a201', '00000000-0000-0000-0000-00000000a202');

set local role authenticated;

-- ————————————————————————— the blocked person —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a202","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.messages (room_id, sender_id, body)
     values ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000a202', 'hello?') $$,
  '42501',
  null,
  'the blocked person cannot keep writing into the two-person room'
);

select is(
  public.room_is_read_only('00000000-0000-0000-0000-00000000b201'),
  true,
  'the blocked person is told the room is read-only'
);

select is(
  (select count(*)::int from public.messages
    where room_id = '00000000-0000-0000-0000-00000000b201'),
  1,
  'read-only is not removal: what was said is still readable'
);

select throws_ok(
  $$ insert into public.room_items (room_id, kind, title, created_by)
     values ('00000000-0000-0000-0000-00000000b201', 'note', 'still here',
             '00000000-0000-0000-0000-00000000a202') $$,
  '42501',
  null,
  'nothing can be filed into a closed room either'
);

select lives_ok(
  $$ insert into public.messages (room_id, sender_id, body)
     values ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000a202', 'what time is the picnic') $$,
  'a group room keeps working for the blocked pair (only notifications stop)'
);

-- ————————————————————————— the person who blocked —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a201","role":"authenticated"}', true);

select throws_ok(
  $$ insert into public.messages (room_id, sender_id, body)
     values ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000a201', 'one more thing') $$,
  '42501',
  null,
  'the room is read-only for the blocker too'
);

select is(
  public.room_is_read_only('00000000-0000-0000-0000-00000000b201'),
  true,
  'the blocker is told the room is read-only'
);

select throws_ok(
  $$ update public.room_items set done = true
     where id = '00000000-0000-0000-0000-00000000e201' $$,
  '42501',
  null,
  'a filed item in a closed room cannot be ticked'
);

select lives_ok(
  $$ insert into public.messages (room_id, sender_id, body)
     values ('00000000-0000-0000-0000-00000000b203', '00000000-0000-0000-0000-00000000a201', 'Saturday?') $$,
  'the blocker''s other match rooms are untouched'
);

select is(
  public.room_is_read_only('00000000-0000-0000-0000-00000000b203'),
  false,
  'a room with no block in it is not read-only'
);

-- ————————————————————————— membership, mute, inbox —————————————————————————
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a203","role":"authenticated"}', true);

select throws_ok(
  $$ update public.room_members
        set room_id = '00000000-0000-0000-0000-00000000b201'
      where room_id = '00000000-0000-0000-0000-00000000b202'
        and member_id = '00000000-0000-0000-0000-00000000a203' $$,
  '42501',
  null,
  'a member cannot move their own membership row into a room they were never in'
);

select lives_ok(
  $$ update public.room_members set muted = true
      where room_id = '00000000-0000-0000-0000-00000000b202'
        and member_id = '00000000-0000-0000-0000-00000000a203' $$,
  'a member can mute a room'
);

select is(
  (select muted from public.room_members
    where room_id = '00000000-0000-0000-0000-00000000b202'
      and member_id = '00000000-0000-0000-0000-00000000a203'),
  true,
  'the mute is recorded on their own row'
);

select is(
  (select last_message_body from public.my_room_inbox()
    where room_id = '00000000-0000-0000-0000-00000000b202'),
  'what time is the picnic',
  'the inbox reads each room''s own latest message'
);

-- ————————————————————————— room photos —————————————————————————
select throws_ok(
  $$ insert into public.messages (room_id, sender_id, body, image_url)
     values ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000a203',
             '📷 Photo', '00000000-0000-0000-0000-00000000a201/voice-1-x.webm') $$,
  '42501',
  null,
  'a photo cannot point at somebody else''s private upload'
);

select lives_ok(
  $$ insert into public.messages (room_id, sender_id, body, image_url)
     values ('00000000-0000-0000-0000-00000000b202', '00000000-0000-0000-0000-00000000a203',
             '📷 Photo', '00000000-0000-0000-0000-00000000a203/room-1-x.jpg') $$,
  'a photo from the sender''s own upload folder is accepted'
);

select throws_ok(
  $$ insert into public.room_items (room_id, kind, title, url, created_by)
     values ('00000000-0000-0000-0000-00000000b202', 'photo', 'Photo',
             '00000000-0000-0000-0000-00000000a201/capsule-1-x.jpg',
             '00000000-0000-0000-0000-00000000a201') $$,
  '42501',
  null,
  'a filed photo cannot claim another person''s folder by naming them as its creator'
);

-- ————————————————————————— leave (D20) —————————————————————————
select is(
  public.leave_room('00000000-0000-0000-0000-00000000b202'),
  'plan_not_over',
  'nobody leaves a plan''s room while the plan is still on'
);

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a201","role":"authenticated"}', true);

select is(
  public.leave_room('00000000-0000-0000-0000-00000000b201'),
  'left',
  'a match room can be left'
);

select is(
  public.is_current_user_room_member('00000000-0000-0000-0000-00000000b201'),
  false,
  'leaving removes the membership'
);

reset role;
update public.events set status = 'past'
  where id = '00000000-0000-0000-0000-00000000c201';
set local role authenticated;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000a203","role":"authenticated"}', true);

select is(
  public.leave_room('00000000-0000-0000-0000-00000000b202'),
  'left',
  'a plan''s room can be left once the plan is over'
);

select is(
  public.leave_room('00000000-0000-0000-0000-00000000b202'),
  'not_member',
  'leaving twice is a no-op, not an error'
);

select * from finish();
rollback;
