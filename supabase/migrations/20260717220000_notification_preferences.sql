-- Per-category push notification preferences.
--
-- These gate WHICH categories of notification send a push to a user's devices.
-- The durable in-app notifications feed is unaffected — notifyUsers() always
-- records the row (see src/lib/server/notify.ts), exactly as quiet hours only
-- ever suppress the push, never the feed. So these are the "what interrupts me"
-- switches, not a way to lose history.
--
-- They are ordinary user preferences on a self-writable row — booleans with no
-- authority meaning, exactly like the discovery_* columns — so living on
-- `profiles` (which the owner can UPDATE) is correct and does not trip the F8
-- authority-column tripwire (see docs/SECURITY.md §3).

alter table public.profiles
  add column if not exists notify_plans boolean not null default true,
  add column if not exists notify_reminders boolean not null default true,
  add column if not exists notify_messages boolean not null default true,
  add column if not exists notify_social boolean not null default true;

-- The 2026-07-10 hardening (20260710120000_lock_sensitive_profile_columns.sql)
-- replaced the table-level SELECT grant with an explicit column allowlist, which
-- is fail-closed: a newly added column is NOT readable by the owner until it is
-- granted here. The settings page reads these back to render the current state,
-- so grant SELECT. They carry no sensitivity (unlike calendar_token / contacts),
-- matching the discovery_* precedent.
grant select (notify_plans, notify_reminders, notify_messages, notify_social)
  on public.profiles to authenticated;
