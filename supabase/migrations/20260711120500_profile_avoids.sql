-- "Give space": a private, one-directional avoidance edge — the soft sibling of
-- a block. You stay connected, but you get a quiet heads-up when someone you've
-- asked for space from is going to be somewhere you are. Invisible to the other
-- person, exactly like a block: the guiding rule is warn, never remove.
--
-- Mirrors public.profile_blocks. Only the avoider can ever see or change their
-- own list (RLS), so the avoided person can never observe that they're on it.
--
-- NOTE: this file originally shared the version timestamp 20260711120000 with
-- the identity_system migration. Two migrations with the same version collide on
-- the schema_migrations primary key, which breaks a clean apply to a fresh
-- database (and could silently skip this one on an incremental push). It has
-- been renamed to a unique version and made idempotent so re-applying is safe
-- regardless of whether an environment already created the table.
create table if not exists public.profile_avoids (
  avoider_id uuid not null references public.profiles(id) on delete cascade,
  avoided_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (avoider_id, avoided_id),
  check (avoider_id <> avoided_id)
);
alter table public.profile_avoids enable row level security;
drop policy if exists profile_avoids_own on public.profile_avoids;
create policy profile_avoids_own on public.profile_avoids for all to authenticated
  using (avoider_id = auth.uid())
  with check (avoider_id = auth.uid());
