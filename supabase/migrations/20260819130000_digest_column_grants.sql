-- The digest columns were added without joining SB-01's allowlist.
--
-- 20260818160000 put `digest_enabled`, `digest_hour` and `digest_sent_at` on
-- public.profiles. That table has no table-level SELECT grant — SB-01
-- (20260710120000) replaced it with an explicit column allowlist — so a column
-- that no migration names is unreadable, and because a denied column fails the
-- WHOLE query, the settings page's profile read would have come back
-- `permission denied for table profiles` and rendered every field on the page
-- blank. Not just the digest controls: the name, the handle, the interests, the
-- notification toggles, all of it.
--
-- This is the third time. `appearance_theme` did it and Settings looked like it
-- was ignoring the theme you picked; `legal_terms_version` did it and the proxy
-- stopped funnelling half-registered accounts into onboarding. The difference
-- this time is that it was caught before merge rather than by a user, because
-- 20260819120000 stopped `supabase/seed.sql` handing the table-wide grant back
-- in local and CI, and `src/lib/profile-column-grants.test.ts` now fails on any
-- profiles column that is neither granted nor documented as withheld.

-- Read back by the settings page through the caller's own client, to render the
-- digest controls at the values they were saved with.
grant select (digest_enabled, digest_hour) on public.profiles to authenticated;

-- `digest_sent_at` is deliberately NOT granted. It is send bookkeeping — the
-- guarantee that a sweep running twice still sends at most one digest a day —
-- and the only thing that reads or writes it is `sweepDigests`, through the
-- service-role client, which bypasses the allowlist. Nothing renders it, so
-- granting it would widen the API surface for no reader. See the WITHHELD table
-- in src/lib/profile-column-grants.test.ts, which records the same reasoning.
