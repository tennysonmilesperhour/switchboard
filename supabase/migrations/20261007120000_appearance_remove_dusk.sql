-- Retire the "Dusk" appearance preset.
--
-- It is gone from the picker (src/lib/themes-app.ts). People who had saved it
-- move to the default look; `resolveTheme` would coerce a stale 'dusk' anyway,
-- but the CHECK must match the ids the app ships. Dusk's token block stays in
-- globals.css: an unsaved dark-mode preference still uses it.

update public.profiles
   set appearance_theme = 'default'
 where appearance_theme = 'dusk';

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
      'default', 'almanac', 'transit',
      'afterparty', 'guestlist', 'prompt',
      'custom'
    ));
end $$;
