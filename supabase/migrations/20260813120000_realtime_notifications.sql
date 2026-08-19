-- In-app banners for live activity.
--
-- Every durable notification (a new room message, a match, an accepted
-- connection, a "down to connect" nudge, a reminder, …) already writes a row to
-- public.notifications via notifyUsers(). The bell badge and /notifications feed
-- read those rows, but only on the next server render — so a member with the app
-- open learned about a new message or match only when they happened to reload or
-- navigate.
--
-- Putting notifications in the realtime publication lets the client subscribe to
-- INSERTs addressed to it and surface a banner the moment one lands, in addition
-- to the bell. This is INSERT-driven, so the default replica identity is enough
-- (the whole new row rides along on an insert, so the user_id=eq filter matches
-- without REPLICA IDENTITY FULL). RLS (notifications_select: user_id = auth.uid())
-- still gates delivery to the recipient alone — no one can subscribe to another
-- person's notifications.
--
-- Guarded so re-running against a database that already has it (a branch that
-- merged this twice, a partially-applied environment) is a no-op.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
