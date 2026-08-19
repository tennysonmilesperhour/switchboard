-- Appearance, part two: make the presets actually stick, and add a custom one.
--
-- ── The bug ──────────────────────────────────────────────────────────────────
--
-- Picking a theme in Settings appeared to do nothing: the swatch flipped, then
-- reverted to Switchboard a moment later, and the app never changed color.
--
-- The write was fine. The READ was denied. 20260710120000 (SB-01) dropped the
-- table-level SELECT grant on public.profiles and replaced it with an explicit
-- column allowlist, and left a note saying every new column has to be added to
-- it or it is unreadable — fail-closed by design. 20260812140000 added
-- `appearance_theme` and never granted it, so every query that names the column
-- (the settings page's profile read, the root layout's theme read) came back
-- 42501 permission denied for the whole row. The layout swallows that and
-- renders the default palette; the settings page renders `profile` as null, so
-- `resolveTheme(undefined)` is 'default'. Only SELECT was revoked, so the
-- UPDATE really did store 'dusk' — the app just could never read it back.
--
-- The grant below is the fix. Nothing about the value is sensitive: it is a
-- personal preference on your own row, like `timezone`, and it is already
-- visible to anyone looking at your screen.
--
-- ── The custom preset ────────────────────────────────────────────────────────
--
-- The four shipped presets are complete palettes chosen for a register. The
-- custom one is the same idea with the three decisions handed to the person:
-- a background, a button color, a highlight color, and optionally a wallpaper
-- image behind it all. Everything else in the token layer — ink, secondary ink,
-- lines, the accent's deep/soft variants, the acceptance and decline colors,
-- the plan palette, the CTA gradient — is DERIVED from those three in
-- src/lib/theme-custom.ts, precisely so the AA contrast invariant survives
-- somebody choosing yellow on white. The database stores the three choices and
-- nothing else; derivation is not a value anyone can write.
--
-- One jsonb column rather than five: these are meaningless apart (a button
-- color with no background behind it is not a half-configured theme, it is a
-- broken one), they are written and read as a unit, and a shape that grows a
-- field later shouldn't cost a migration for a preference blob. Validation is
-- `parseCustomAppearance`, which is fail-safe: any field that is missing,
-- malformed, or points somewhere other than our own storage falls back to the
-- default rather than rejecting, so a row written by an older or newer deploy
-- still renders a readable app.

-- SB-01's allowlist, extended. See 20260710120000 for why this is needed at all.
grant select (appearance_theme) on public.profiles to authenticated;

alter table public.profiles
  add column if not exists appearance_custom jsonb not null default '{}'::jsonb;

grant select (appearance_custom) on public.profiles to authenticated;

-- 'custom' joins the presets the column will accept. The CHECK is a guard
-- against a typo reaching the column, not the app's validation — `resolveTheme`
-- still coerces anything unknown to the default on the way out.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'profiles_appearance_theme_check'
  ) then
    alter table public.profiles
      drop constraint profiles_appearance_theme_check;
  end if;

  alter table public.profiles
    add constraint profiles_appearance_theme_check
    check (appearance_theme in ('default', 'dusk', 'almanac', 'transit', 'custom'));
end $$;

-- ── The same defect, one route over ──────────────────────────────────────────
--
-- Auditing every profiles column against SB-01's allowlist turned up a second
-- one, older and worse: 20260710130000 added `legal_terms_version`,
-- `legal_terms_accepted_at`, and `community_covenant_accepted_at` ten minutes
-- after the allowlist landed, and never joined it. The proxy's funnel reads
-- `select('onboarded, legal_terms_version')` on every protected route, so that
-- read has been failing outright — and a failed read is indistinguishable from
-- "no profile row" at the call site, which means the branch that sends a
-- half-registered account to /onboarding, and the branch that sends someone to
-- /legal-update, have both been silently skipped. Same for the /legal-update
-- page's own "already accepted, go home" check.
--
-- These are not SB-01's kind of column. That fix was about harvestable secrets
-- — the calendar bearer token, contact details behind a `contact_public`
-- opt-out. A terms version string and two acceptance timestamps are neither a
-- credential nor contact information, and every profile already publishes more
-- about its owner than these do. So they join the allowlist rather than moving
-- behind a security-definer accessor.
grant select (
  legal_terms_version,
  legal_terms_accepted_at,
  community_covenant_accepted_at
) on public.profiles to authenticated;
