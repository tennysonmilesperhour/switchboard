-- Shared Moments must reveal neither blocked candidates nor pre-consent free
-- text through its SECURITY DEFINER discovery function.

begin;
select plan(8);

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-000000000001', 'moment-alice@example.com'),
  ('40000000-0000-0000-0000-000000000002', 'moment-bob@example.com'),
  ('40000000-0000-0000-0000-000000000003', 'moment-charlie@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('40000000-0000-0000-0000-000000000001', 'Moment Alice', true),
  ('40000000-0000-0000-0000-000000000002', 'Moment Bob', true),
  ('40000000-0000-0000-0000-000000000003', 'Moment Charlie', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.moments (
  id, user_id, place_name, experiences, headline, available_until, status
) values
  (
    '40000000-0000-0000-0000-000000000011',
    '40000000-0000-0000-0000-000000000001',
    'Union Station',
    array['Coffee'],
    'Alice identifying headline',
    now() + interval '2 hours',
    'open'
  ),
  (
    '40000000-0000-0000-0000-000000000012',
    '40000000-0000-0000-0000-000000000002',
    'Union Station',
    array['Coffee'],
    'Bob identifying headline',
    now() + interval '2 hours',
    'open'
  ),
  (
    '40000000-0000-0000-0000-000000000013',
    '40000000-0000-0000-0000-000000000003',
    'Union Station',
    array['Walking'],
    'Charlie identifying headline',
    now() + interval '2 hours',
    'open'
  );

set local role authenticated;

-- Positive controls before any block.
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*)::int from public.find_shared_moments('Union Station')),
  2,
  'an unblocked caller sees the other open moments at the same place'
);
select is(
  (
    select count(*)::int
      from public.find_shared_moments('Union Station')
     where headline is not null
  ),
  0,
  'anonymous discovery never returns pre-consent free-text headlines'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (select count(*)::int from public.find_shared_moments('Union Station')),
  2,
  'the unblocked visibility is initially symmetric'
);

-- Alice blocks Bob. Discovery must close in both directions, even though only
-- Alice authored the block row.
reset role;
insert into public.profile_blocks (blocker_id, blocked_id) values (
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000002'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::int
      from public.find_shared_moments('Union Station')
     where id = '40000000-0000-0000-0000-000000000012'
  ),
  0,
  'a blocker no longer sees the blocked person'
);
select is(
  (
    select count(*)::int
      from public.find_shared_moments('Union Station')
     where id = '40000000-0000-0000-0000-000000000013'
  ),
  1,
  'blocking one person does not hide an unrelated candidate'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::int
      from public.find_shared_moments('Union Station')
     where id = '40000000-0000-0000-0000-000000000011'
  ),
  0,
  'the blocked person no longer sees the blocker either'
);
select is(
  (
    select count(*)::int
      from public.find_shared_moments('Union Station')
     where id = '40000000-0000-0000-0000-000000000013'
  ),
  1,
  'the blocked person still sees an unrelated candidate'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);
select is(
  (select count(*)::int from public.find_shared_moments('Union Station')),
  2,
  'a third party still sees both people in the blocked pair'
);

select * from finish();
rollback;
