-- "Ignore" on a connection request sticks for 90 days (G34; D22).
--
-- Ignore used to delete the request, so the same person could ask again at
-- once, and did: the addressee's only way to make it stop was a block, which
-- is a far bigger statement than "not now". An ignore is now a private,
-- one-directional row owned by the person ignoring:
--
--   * For 90 days, any pending request from that person is hidden from them —
--     at the SELECT policy, so every surface that lists requests (People,
--     Notifications, a profile's "wants to connect") agrees without each one
--     re-deriving it. The request itself is not refused, so the sender is told
--     nothing: from their side it is simply still pending, which is true.
--   * The server skips the "wants to connect" notification while it holds
--     (src/lib/actions/connections.ts).
--   * Sending them a request yourself clears it — you changed your mind — and
--     then accepts their waiting request instead of creating a second one.
--
-- Like profile_avoids, only the owner can ever see or change their own rows.

create table if not exists public.connection_request_ignores (
  ignorer_id uuid not null references public.profiles(id) on delete cascade,
  ignored_id uuid not null references public.profiles(id) on delete cascade,
  ignored_at timestamptz not null default now(),
  primary key (ignorer_id, ignored_id),
  check (ignorer_id <> ignored_id)
);

create index if not exists connection_request_ignores_ignored_idx
  on public.connection_request_ignores (ignored_id);

alter table public.connection_request_ignores enable row level security;

drop policy if exists connection_request_ignores_own on public.connection_request_ignores;
create policy connection_request_ignores_own on public.connection_request_ignores
  for all to authenticated
  using (ignorer_id = (select auth.uid()))
  with check (ignorer_id = (select auth.uid()));

-- The addressee no longer sees a pending request from someone they ignored in
-- the last 90 days. The requester's own view of the row is unchanged.
alter policy connections_select on public.connections
  using (
    requester_id = (select auth.uid())
    or (
      addressee_id = (select auth.uid())
      and not (
        status = 'pending'
        and exists (
          select 1 from public.connection_request_ignores i
          where i.ignorer_id = (select auth.uid())
            and i.ignored_id = connections.requester_id
            and i.ignored_at > now() - interval '90 days'
        )
      )
    )
  );
