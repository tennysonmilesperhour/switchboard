-- A fifth notification category: new ideas added to a plan you're voting on.
--
-- Until now, adding a poll option was the one piece of plan activity that told
-- nobody. Someone who had already ranked every idea had no way to learn that a
-- new one appeared — they either kept re-opening the plan or voted on a subset
-- without knowing it. This is the push that closes that gap.
--
-- It gets its OWN column rather than riding on notify_plans because the whole
-- point is that it must be muteable on its own: a brainstorm can produce a burst
-- of ideas, and the only escape from that under notify_plans would be to also
-- lose invitations, RSVPs, and cancellations. A switch you can't reach without
-- giving up something you need is not a switch.
--
-- Same shape as the other four (20260717230000_notification_preferences.sql):
-- an ordinary preference boolean on a self-writable row, no authority meaning,
-- gating the push only — notifyUsers() still records the in-app row regardless,
-- so muting costs you the buzz and never the history.

alter table public.profiles
  add column if not exists notify_suggestions boolean not null default true;

-- The column allowlist from 20260710120000_lock_sensitive_profile_columns.sql is
-- fail-closed: a new column is unreadable by its own owner until granted. The
-- settings page reads this back to render the toggle.
grant select (notify_suggestions) on public.profiles to authenticated;
