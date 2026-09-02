-- The event detail and settings loaders issue these lookups on every request.
-- Keep their authorization/filter columns indexed so splitting the reads into
-- parallel phases lowers wall-clock time instead of merely increasing database
-- work. `inviting` is the only status the cascade sweeps globally, hence the
-- narrow partial index rather than a second full-table status index.

create index if not exists events_host_status_idx
  on public.events (host_id, status);

create index if not exists events_inviting_idx
  on public.events (status)
  where status = 'inviting';

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create index if not exists poll_votes_poll_idx
  on public.poll_votes (poll_id);
