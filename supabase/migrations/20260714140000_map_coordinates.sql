-- Map overlays: optional geographic coordinates so plans (events), serendipity
-- zones, and shared places (moments) can be plotted on a real map and toggled
-- as layers. Every column is nullable and additive — existing rows and flows
-- are untouched, and a row simply doesn't appear on the map until it carries
-- BOTH a latitude and a longitude.
--
-- Coordinates are low-sensitivity (a public venue point, derived from the
-- free-text address the row already stores) and inherit each table's existing
-- RLS, so no policy changes are needed. The range checks reject impossible
-- coordinates while still allowing null.
alter table public.events
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.zones
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.moments
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_coords_range') then
    alter table public.events add constraint events_coords_range check (
      (latitude is null or latitude between -90 and 90)
      and (longitude is null or longitude between -180 and 180)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zones_coords_range') then
    alter table public.zones add constraint zones_coords_range check (
      (latitude is null or latitude between -90 and 90)
      and (longitude is null or longitude between -180 and 180)
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'moments_coords_range') then
    alter table public.moments add constraint moments_coords_range check (
      (latitude is null or latitude between -90 and 90)
      and (longitude is null or longitude between -180 and 180)
    );
  end if;
end $$;
