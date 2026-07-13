-- Live updates for two surfaces that were only ever refreshing manually:
--
-- 1. Mutual mode. MutualClient subscribes to UPDATE on its own mutual_intents
--    rows (filter author_id = me) to react when the check_mutual_match trigger
--    flips the row to 'matched'. The table was never in the realtime
--    publication, so that subscription was dead. REPLICA IDENTITY FULL is
--    required for the author_id filter to match on UPDATE events (the default
--    identity only carries the primary key in the change record). RLS
--    (mutual_intents_own) still restricts every subscriber to their own rows,
--    so unrequited interest is never exposed.
--
-- 2. Living-room auto-filed items. RoomClient only subscribed to `messages`, so
--    addresses/tasks/links that file themselves into the tabs did not appear for
--    other members until reload. room_items is INSERT-driven, so the default
--    replica identity is sufficient; RLS (room_items_select) gates delivery to
--    room members.
--
-- Both adds are guarded so re-running against a database that already has them
-- (e.g. a branch that merged this twice) is a no-op.

alter table public.mutual_intents replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'mutual_intents'
  ) then
    alter publication supabase_realtime add table public.mutual_intents;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_items'
  ) then
    alter publication supabase_realtime add table public.room_items;
  end if;
end $$;
