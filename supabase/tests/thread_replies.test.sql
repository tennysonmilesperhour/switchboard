-- pgTAP coverage for 20260912120100_thread_replies.sql: a reply may only
-- answer a comment on the same plan, and reading a reply stays gated by the
-- thread policy.

begin;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c0057', 'thread-host@example.com'),
  ('00000000-0000-0000-0000-0000000c0001', 'thread-guest@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('00000000-0000-0000-0000-0000000c0057', 'Host', true),
  ('00000000-0000-0000-0000-0000000c0001', 'Guest', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (id, host_id, title, status) values
  ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0057', 'Boat day', 'confirmed'),
  ('00000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0057', 'Other plan', 'confirmed');
insert into public.invites (id, event_id, invitee_id, position, status) values
  ('00000000-0000-0000-0000-0000000c0a01', '00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0001', 0, 'accepted');
insert into public.event_comments (id, event_id, author_id, body) values
  ('00000000-0000-0000-0000-0000000c0c01', '00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0057', 'Can we add a photo?'),
  ('00000000-0000-0000-0000-0000000c0c02', '00000000-0000-0000-0000-0000000c0e02', '00000000-0000-0000-0000-0000000c0057', 'Elsewhere');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000c0001","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.event_comments (event_id, author_id, body, reply_to_id)
       values ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0001',
               'Yes, under Add details', '00000000-0000-0000-0000-0000000c0c01') $$,
  'an accepted guest can reply to a comment on the plan'
);

select throws_ok(
  $$ insert into public.event_comments (event_id, author_id, body, reply_to_id)
       values ('00000000-0000-0000-0000-0000000c0e01', '00000000-0000-0000-0000-0000000c0001',
               'Sneaky', '00000000-0000-0000-0000-0000000c0c02') $$,
  'a reply must answer a comment on the same plan',
  'a reply cannot point at a comment on another plan'
);

select is(
  (select count(*)::int from public.event_comments
     where event_id = '00000000-0000-0000-0000-0000000c0e01' and reply_to_id is not null),
  1,
  'the reply reads back with its parent for someone in the thread'
);

select * from finish();
rollback;
