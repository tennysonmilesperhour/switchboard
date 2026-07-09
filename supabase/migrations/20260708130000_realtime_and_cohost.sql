-- Prompt 5: live poll consensus (realtime) + co-host write powers.

-- ————————————————————————— live poll consensus —————————————————————————
-- Individual votes are author-only (anonymity invariant), so a client cannot
-- subscribe to poll_votes to watch the tally move. Instead, bump a
-- non-sensitive version counter on the poll row whenever a vote changes;
-- voters subscribe to that row and re-fetch aggregates via poll_results().
-- This signals "the tally moved" without ever exposing who voted or how.
alter table public.polls add column if not exists tally_version int not null default 0;

create or replace function public.bump_poll_tally()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_poll uuid := coalesce(new.poll_id, old.poll_id);
begin
  update public.polls set tally_version = tally_version + 1 where id = v_poll;
  return null;
end $$;

drop trigger if exists on_poll_vote_change on public.poll_votes;
create trigger on_poll_vote_change
  after insert or update or delete on public.poll_votes
  for each row execute function public.bump_poll_tally();

-- Publish the polls table for Realtime (idempotent).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'polls'
  ) then
    alter publication supabase_realtime add table public.polls;
  end if;
end $$;

-- ————————————————————————— co-host write powers —————————————————————————
-- is_event_host() already treats the primary host and co-hosts alike. Route the
-- host-only write policies through it so co-hosts can post announcements and
-- resolve polls, matching the "co-hosts share host powers" contract. (The
-- server actions are updated to match; closeVoting resolves via the admin
-- client, so its own check is loosened there too.)
drop policy if exists announcements_insert on public.announcements;
create policy announcements_insert on public.announcements for insert to authenticated
  with check (author_id = auth.uid() and public.is_event_host(event_id, auth.uid()));

drop policy if exists announcements_delete on public.announcements;
create policy announcements_delete on public.announcements for delete to authenticated
  using (public.is_event_host(event_id, auth.uid()));

drop policy if exists polls_update on public.polls;
create policy polls_update on public.polls for update to authenticated
  using (public.is_event_host(event_id, auth.uid()));
