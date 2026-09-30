-- Three findings from the Supabase database advisors, none of which changes
-- what any caller can do.
--
-- 1. `freeze_event_share_token` was the one trigger function without a fixed
--    search_path. It runs as the invoker on every events UPDATE, so pin it
--    like its freeze_* siblings.
alter function public.freeze_event_share_token() set search_path = public;

-- 2. The board invite functions were granted to `authenticated` but kept the
--    default PUBLIC execute, so `anon` could reach them through the REST API.
--    Each already raises 'not signed in' for a missing session; this removes
--    the path rather than relying on that check.
revoke execute on function public.ensure_board_invite_code(uuid) from public, anon;
revoke execute on function public.rotate_board_invite_code(uuid) from public, anon;
revoke execute on function public.join_board_via_code(text) from public, anon;
grant execute on function public.ensure_board_invite_code(uuid) to authenticated;
grant execute on function public.rotate_board_invite_code(uuid) to authenticated;
grant execute on function public.join_board_via_code(text) to authenticated;

-- 3. `messages_room_latest_idx` (20260731192027) repeats
--    `messages_room_created_idx` (init) column for column. Every write paid
--    for both.
drop index if exists public.messages_room_latest_idx;
