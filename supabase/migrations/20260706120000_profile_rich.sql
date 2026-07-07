-- Richer, fully-editable profiles.
-- Adds presentation + contact fields to `profiles`, and two public storage
-- buckets (avatars, covers) that each user may write to only under a folder
-- named for their own uid. Everything here is self-managed by the owner via
-- the existing `profiles_update` policy (id = auth.uid()).

alter table public.profiles
  add column if not exists cover_url text,
  add column if not exists tagline text,
  add column if not exists pronouns text,
  add column if not exists location text,
  -- [{ "label": "...", "url": "https://..." }]
  add column if not exists links jsonb not null default '[]'::jsonb,
  -- [{ "platform": "instagram", "value": "handle-or-url" }]
  add column if not exists socials jsonb not null default '[]'::jsonb,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  -- When true, contact_email / contact_phone are shown to other signed-in
  -- users and embedded in the shareable QR / vCard. Off by default.
  add column if not exists contact_public boolean not null default false;

-- ————————————————————————— media storage —————————————————————————
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true), ('covers', 'covers', true)
on conflict (id) do nothing;

-- Public read for both buckets (avatars/covers are shown across the app).
drop policy if exists "profile media public read" on storage.objects;
create policy "profile media public read"
  on storage.objects for select
  using (bucket_id in ('avatars', 'covers'));

-- A user may only create/replace/delete objects inside a top-level folder
-- named for their own uid, e.g. `<uid>/avatar-169....png`.
drop policy if exists "profile media owner insert" on storage.objects;
create policy "profile media owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile media owner update" on storage.objects;
create policy "profile media owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "profile media owner delete" on storage.objects;
create policy "profile media owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id in ('avatars', 'covers')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
