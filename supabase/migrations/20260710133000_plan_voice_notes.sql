-- Voice notes across plans: a spoken/written reason on a cancellation, and
-- voice notes in the event thread (20260710131000_event_thread.sql).
--
-- Audio itself lives in the existing public `media` storage bucket (per-user
-- folder write, public read — see 20260707120000_media_bucket.sql); these
-- columns only hold the resulting URLs plus a duration for the player.

-- ————————————————————————— cancellation reason —————————————————————————
-- When a host calls off a plan they can now say why, in text and/or a voice
-- note. Both are surfaced on the (now cancelled) event page and folded into the
-- cancellation notification so nobody is left guessing.
alter table public.events
  add column if not exists cancel_reason text
    check (cancel_reason is null or char_length(cancel_reason) <= 2000),
  add column if not exists cancel_voice_url text;

-- ————————————————————————— voice notes in the thread —————————————————————————
-- Extend the event thread so a comment can be a voice note, written text, or
-- both. `body` becomes optional (it was NOT NULL); a comment must still carry
-- something. Access, gating, and moderation are unchanged — they already live
-- in the event_comments RLS policies from 20260710131000.
alter table public.event_comments
  add column if not exists voice_url text,
  add column if not exists voice_duration_seconds int
    check (voice_duration_seconds is null or voice_duration_seconds between 0 and 600);

alter table public.event_comments alter column body drop not null;

-- A comment must carry written words, a voice note, or both.
alter table public.event_comments
  drop constraint if exists event_comments_has_content;
alter table public.event_comments
  add constraint event_comments_has_content check (body is not null or voice_url is not null);

-- A duration without its audio is meaningless.
alter table public.event_comments
  drop constraint if exists event_comments_voice_shape;
alter table public.event_comments
  add constraint event_comments_voice_shape
    check (voice_duration_seconds is null or voice_url is not null);
