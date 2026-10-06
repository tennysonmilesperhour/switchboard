-- Three more appearance presets: Afterparty, Guestlist, and Prompt.
--
-- Each is a complete token block in src/app/globals.css (palette, faces, radii
-- and shadows) registered in src/lib/themes-app.ts. The column already stores
-- the chosen id as text; this widens the CHECK so the new ids can be saved.
-- As before, the CHECK only guards against a typo reaching the column.
-- `resolveTheme` still coerces anything unknown to the default on the way out,
-- so a row written by a newer deploy renders readably on an older one.
--
-- No grant changes: `appearance_theme` is already on the profiles SELECT
-- allowlist (20260819120000).

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
    check (appearance_theme in (
      'default', 'dusk', 'almanac', 'transit',
      'afterparty', 'guestlist', 'prompt',
      'custom'
    ));
end $$;
