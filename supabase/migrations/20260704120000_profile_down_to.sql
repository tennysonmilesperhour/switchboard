-- Profiles gain a "down to do" dimension, distinct from passive interests.
-- Interests describe who someone is; down_to lists the concrete activities
-- they're up for — the same vocabulary signals and Mutual mode already use.
alter table public.profiles
  add column if not exists down_to text[] not null default '{}';
