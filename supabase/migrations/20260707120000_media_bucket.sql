-- General-purpose image uploads (plan cover photos, capsule snapshots, and any
-- other in-app image a member attaches). Mirrors the avatars/covers setup from
-- 20260706120000_profile_rich.sql: one public bucket that each user may write to
-- only under a top-level folder named for their own uid.
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

-- Public read — these images are shown across the app (plan cards, capsules…).
drop policy if exists "media public read" on storage.objects;
create policy "media public read"
  on storage.objects for select
  using (bucket_id = 'media');

-- A user may only create/replace/delete objects inside a top-level folder named
-- for their own uid, e.g. `<uid>/event-cover-169….jpg`.
drop policy if exists "media owner insert" on storage.objects;
create policy "media owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media owner update" on storage.objects;
create policy "media owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
