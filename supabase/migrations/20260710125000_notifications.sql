-- SB-05  There was no notifications table: every in-app surface (bell badge,
--        /notifications) was derived by re-querying domain tables for specific
--        statuses, so any event that fired a push but whose row didn't match one
--        of those hardcoded queries was invisible to anyone who never enabled
--        push (connection accepted, join request/approval, matchmaker match,
--        event cancelled/updated, ritual proposal, reminders, …). This is a
--        single durable surface those events write to, with read tracking.
--
-- SB-06  Reminders in particular were push-only, and push silently drops anyone
--        in quiet hours *after* the idempotency marker was already claimed — so
--        a "starting soon" reminder inside quiet hours was lost forever. Writing
--        an in-app row here (never quiet-hours gated) makes that reminder
--        reliably visible.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_recent_idx
  on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;

-- Recipients read and mark-read their own notifications. Inserts happen only via
-- the service-role client from server actions (no authenticated insert policy),
-- so a user can't fabricate notifications for anyone — including themselves.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid());
