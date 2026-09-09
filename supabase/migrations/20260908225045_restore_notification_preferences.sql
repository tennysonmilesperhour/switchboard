-- Production recorded 20260717230000 but was missing its four columns.
-- Forward repair: preserve existing values and restore the original narrow grant.
alter table public.profiles
  add column if not exists notify_plans boolean not null default true,
  add column if not exists notify_reminders boolean not null default true,
  add column if not exists notify_messages boolean not null default true,
  add column if not exists notify_social boolean not null default true;
grant select (notify_plans, notify_reminders, notify_messages, notify_social)
  on public.profiles to authenticated;
