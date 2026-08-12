-- Let people choose how Switchboard looks.
--
-- The whole visual system is already driven by the `@theme` token layer in
-- globals.css — docs/DESIGN-SYSTEM.md's "If you re-theme" section says as much,
-- because components reference tokens (`bg-terracotta`, `text-ink`,
-- `bg-brand-gradient`, `plan-*`) rather than raw hex. So a preset is a token
-- override on `<html data-theme>`, and nothing else has to change.
--
-- The stored value is a plain preference on the person's own row, like
-- `timezone` — no authority, nothing anyone else can see, nothing that gates
-- access. It lives on the profile rather than in localStorage so a chosen look
-- follows the account to a new phone, which is the whole reason people ask for
-- this.
--
-- Unknown values degrade to the default rather than erroring: the CHECK keeps
-- the column honest, and `resolveTheme` in src/lib/themes-app.ts falls back if
-- a value ever arrives from an older or newer deploy.

alter table public.profiles
  add column if not exists appearance_theme text not null default 'default';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_appearance_theme_check'
  ) then
    alter table public.profiles
      add constraint profiles_appearance_theme_check
      check (appearance_theme in ('default', 'dusk', 'almanac', 'transit'));
  end if;
end $$;
