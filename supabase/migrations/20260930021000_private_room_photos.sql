-- Room photos move to private storage (G2).
--
-- 20260717200100_room_photos.sql put photos shared in a room into the PUBLIC
-- `media` bucket "so realtime delivery needs no per-viewer signing". That made
-- the object readable by anyone holding its URL, whether or not they were ever
-- in the room: the database said "members only" and the storage said
-- "everyone", which is the disagreement docs/SECURITY.md ("Media privacy")
-- exists to rule out. New room photos are uploaded to the private
-- `media-private` bucket; the column holds the storage PATH, and the room page
-- (a server component that has already passed the room's RLS) signs it just
-- before rendering. Legacy rows keep their public https URL and keep rendering
-- through signMediaRef's pass-through.
--
-- A path is a reference into a bucket that holds other people's voice notes
-- and capsule photos too, and `messages_insert` / `room_items_write` are
-- reachable straight from the browser. Without a check here, a member could
-- store `<someone else's uid>/voice-….webm` as a "photo" and have the room page
-- mint a signed URL for it. So a stored path must sit in the writer's own
-- upload folder — the same rule the bucket's own insert policy applies to the
-- upload itself. Full http(s) URLs (legacy rows, links) are left as they were.

create or replace function private.guard_room_media_ref()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ref text;
  v_owner uuid;
begin
  if tg_table_name = 'messages' then
    if tg_op = 'UPDATE' and new.image_url is not distinct from old.image_url then
      return new;
    end if;
    v_ref := new.image_url;
    -- messages_insert pins sender_id to auth.uid(); the service role writes the
    -- sender it has already authenticated.
    v_owner := new.sender_id;
  else
    if new.kind <> 'photo'
       or (tg_op = 'UPDATE' and new.url is not distinct from old.url) then
      return new;
    end if;
    v_ref := new.url;
    -- room_items_write does not pin created_by, so a browser write is held to
    -- the caller's own folder whatever created_by claims.
    v_owner := coalesce(auth.uid(), new.created_by);
  end if;

  if v_ref is null or v_ref ~* '^https?://' then
    return new;
  end if;

  if v_owner is null
     or position('..' in v_ref) > 0
     or v_ref !~ '^[^/]+/[^/].*$'
     or split_part(v_ref, '/', 1) <> v_owner::text then
    raise exception 'a room photo must be one of your own uploads'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_room_media_ref() from public, anon, authenticated;
grant execute on function private.guard_room_media_ref() to service_role;

drop trigger if exists messages_guard_media_ref on public.messages;
create trigger messages_guard_media_ref
  before insert or update on public.messages
  for each row execute function private.guard_room_media_ref();

drop trigger if exists room_items_guard_media_ref on public.room_items;
create trigger room_items_guard_media_ref
  before insert or update on public.room_items
  for each row execute function private.guard_room_media_ref();
