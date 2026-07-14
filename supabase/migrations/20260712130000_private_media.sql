-- Private media bucket for access-gated user content (F4).
--
-- Voice notes (event_comments.voice_url, events.cancel_voice_url) and capsule
-- photos (capsule_entries.photo_url) are gated at the ROW level by RLS
-- (can_access_event_thread / can_view_event), but they were stored in the
-- PUBLIC `media` bucket — so the underlying object was fetchable by anyone with
-- the URL, and the database gate and the storage gate disagreed. Profile
-- avatars/covers and event cover images stay public (they are meant to be
-- broadly visible); only the gated content moves here.
--
-- This bucket has NO public-read policy. Objects are readable only through
-- short-lived signed URLs minted server-side by the service-role client (see
-- src/lib/server/media.ts), so a viewer must pass through the app's row-level
-- authorization to ever receive a URL. Writes are still owner-scoped to a
-- top-level folder named for the uploader's uid, mirroring the `media` bucket.

insert into storage.buckets (id, name, public)
values ('media-private', 'media-private', false)
on conflict (id) do nothing;

-- No SELECT policy on purpose: reads happen exclusively via signed URLs, which
-- the service role generates (bypassing RLS). Direct anon/authenticated reads
-- of this bucket are denied.

drop policy if exists "media-private owner insert" on storage.objects;
create policy "media-private owner insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media-private owner update" on storage.objects;
create policy "media-private owner update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media-private owner delete" on storage.objects;
create policy "media-private owner delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media-private'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
