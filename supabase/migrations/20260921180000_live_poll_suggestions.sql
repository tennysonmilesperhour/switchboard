-- A new idea on a poll should arrive the way a vote does.
--
-- `bump_poll_tally` (20260708130000) fires only on `poll_votes`, and
-- `poll_options` is not in the realtime publication, so nothing signals that
-- the list of ideas itself changed. PollSection subscribes to this poll's
-- `polls` row and re-fetches on the bump — the one live channel it has — and
-- therefore never learned about a suggestion, an edit (J1), or a removal.
--
-- What stood in for it was the notification path, and only by accident:
-- `notifySuggestionAdded` writes a row, LiveNotifications sees the INSERT and
-- calls router.refresh(). That covers the wrong people at the wrong times.
-- It reaches the host, co-hosts, and anyone who has already voted — not the
-- person reading the list who has not ranked anything yet, which is exactly
-- who is watching a brainstorm. And a burst folds into the standing
-- notification with an UPDATE rather than an INSERT, so during the case the
-- coalescing was built for — "five ideas in two minutes" — only the first idea
-- refreshed anybody at all.
--
-- Reusing the same counter rather than publishing `poll_options` keeps the
-- anonymity posture intact: what crosses the wire is still a bare integer on a
-- row every viewer of the poll can already read. It says "this poll moved" and
-- nothing about who moved it. The client's existing coalescing window absorbs
-- the extra bumps.
create or replace function public.bump_poll_tally()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  -- `poll_votes` and `poll_options` both carry poll_id, so one function serves
  -- both triggers. On DELETE only OLD is populated.
  v_poll uuid := coalesce(new.poll_id, old.poll_id);
begin
  update public.polls set tally_version = tally_version + 1 where id = v_poll;
  return null;
end $$;

drop trigger if exists on_poll_option_change on public.poll_options;
create trigger on_poll_option_change
  after insert or update or delete on public.poll_options
  for each row execute function public.bump_poll_tally();

-- A trigger entry point, never a client RPC. `create or replace` keeps the
-- existing grants, so this only restates what 20260713151000 already decided —
-- the convention being that a recreated function must not quietly widen them.
revoke execute on function public.bump_poll_tally() from public, anon, authenticated;
