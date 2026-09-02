-- Guardian-approval authorization regression tests.
--
-- The first request is created by a server action only after it reads the
-- caller's own invite through RLS. The table remains deny-all for browser
-- writes. Resolution is token-addressed, but a privileged malformed row must
-- still be inert when its invite and event do not match.

begin;
select plan(8);

-- ————————————————————————— fixtures —————————————————————————
insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-000000000001', 'approval-host@example.com'),
  ('30000000-0000-0000-0000-000000000002', 'approval-invitee@example.com'),
  ('30000000-0000-0000-0000-000000000003', 'approval-stranger@example.com');

insert into public.profiles (id, display_name, onboarded) values
  ('30000000-0000-0000-0000-000000000001', 'Approval Host', true),
  ('30000000-0000-0000-0000-000000000002', 'Approval Invitee', true),
  ('30000000-0000-0000-0000-000000000003', 'Approval Stranger', true)
on conflict (id) do update
  set display_name = excluded.display_name, onboarded = excluded.onboarded;

insert into public.events (
  id, host_id, title, status, parental_approval
) values
  (
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000001',
    'First youth plan',
    'inviting',
    true
  ),
  (
    '30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000001',
    'Second youth plan',
    'inviting',
    true
  );

insert into public.invites (
  id, event_id, invitee_id, position, status
) values
  (
    '30000000-0000-0000-0000-000000000021',
    '30000000-0000-0000-0000-000000000011',
    '30000000-0000-0000-0000-000000000002',
    0,
    'accepted'
  ),
  (
    '30000000-0000-0000-0000-000000000022',
    '30000000-0000-0000-0000-000000000012',
    '30000000-0000-0000-0000-000000000002',
    0,
    'accepted'
  );

-- The first row deliberately crosses plans. Only privileged code can create
-- this shape, which is exactly why the SECURITY DEFINER resolver must reject
-- it independently of the application action.
insert into public.parental_approvals (
  id, invite_id, event_id, guardian_email, token
) values
  (
    '30000000-0000-0000-0000-000000000031',
    '30000000-0000-0000-0000-000000000021',
    '30000000-0000-0000-0000-000000000012',
    'guardian-one@example.com',
    'mismatched-approval-token'
  ),
  (
    '30000000-0000-0000-0000-000000000032',
    '30000000-0000-0000-0000-000000000022',
    '30000000-0000-0000-0000-000000000012',
    'guardian-two@example.com',
    'valid-approval-token'
  );

-- ————————————————————————— stranger —————————————————————————
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000003","role":"authenticated"}',
  true
);

select is(
  (
    select count(*)::int
      from public.invites
     where id = '30000000-0000-0000-0000-000000000021'
  ),
  0,
  'a non-invitee cannot read the invite used to authorize a guardian request'
);

select throws_ok(
  $$
    insert into public.parental_approvals (
      invite_id, event_id, guardian_email
    ) values (
      '30000000-0000-0000-0000-000000000021',
      '30000000-0000-0000-0000-000000000011',
      'attacker@example.com'
    )
  $$,
  '42501',
  null,
  'a non-invitee cannot create a guardian approval for someone else'
);

-- Positive control for the RLS read the server action relies on.
select set_config(
  'request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated"}',
  true
);
select is(
  (
    select count(*)::int
      from public.invites
     where invitee_id = '30000000-0000-0000-0000-000000000002'
  ),
  2,
  'the invitee can read their own sent or accepted invites'
);

-- ————————————————————————— token resolution —————————————————————————
set local role anon;
select is(
  public.resolve_parental_approval('mismatched-approval-token', true)->>'outcome',
  'invite_mismatch',
  'a token whose approval event does not match its invite is rejected'
);

reset role;
select is(
  (
    select status
      from public.parental_approvals
     where id = '30000000-0000-0000-0000-000000000031'
  ),
  'pending',
  'a mismatched approval remains pending'
);
select is(
  (
    select status
      from public.invites
     where id = '30000000-0000-0000-0000-000000000021'
  ),
  'accepted',
  'a mismatched approval does not mutate its invite'
);

set local role anon;
select is(
  public.resolve_parental_approval('valid-approval-token', true)->>'outcome',
  'approved',
  'a matching guardian capability still resolves normally'
);

reset role;
select is(
  (
    select status
      from public.parental_approvals
     where id = '30000000-0000-0000-0000-000000000032'
  ),
  'approved',
  'a matching approval is persisted as approved'
);

select * from finish();
rollback;
