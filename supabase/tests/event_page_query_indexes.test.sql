-- pgTAP contract for the hot-path indexes introduced with the parallel event
-- page loader. Names are pinned as well as existence so EXPLAIN snapshots and
-- production diagnostics have stable identifiers.

begin;
select plan(4);

select has_index(
  'public',
  'events',
  'events_host_status_idx',
  'events has the host/status lookup index'
);

select has_index(
  'public',
  'events',
  'events_inviting_idx',
  'events has the inviting sweep index'
);

select has_index(
  'public',
  'push_subscriptions',
  'push_subscriptions_user_idx',
  'push subscriptions have the user lookup index'
);

select has_index(
  'public',
  'poll_votes',
  'poll_votes_poll_idx',
  'poll votes have the poll aggregate index'
);

select * from finish();
rollback;
