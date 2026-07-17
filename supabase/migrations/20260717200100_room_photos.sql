-- Photo messages in Living Rooms.
--
-- The rooms empty state has long promised that "photos quietly organize
-- themselves," but there was no way to send one — `messages` held text only and
-- the 'photo' room_item kind was unused. This adds an optional image to a
-- message. Photos live in the public `media` bucket (same posture as avatars
-- and event covers) so realtime delivery needs no per-viewer signing; the URL
-- is validated server-side to be one of our own storage objects before it's
-- stored. Each photo message also files a `room_items` row (kind='photo') so
-- the Photos tab is a gallery of everything shared.
alter table public.messages
  add column if not exists image_url text;
