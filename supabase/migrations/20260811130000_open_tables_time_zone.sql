-- `list_open_tables()` feeds the Discover page's "Open tables near your circle"
-- cards (src/components/events/OpenTables.tsx). It returned every field the card
-- needs except the event's IANA `time_zone`, so the card formatted start times
-- with no zone: the server rendered them in UTC and the browser in the viewer's
-- zone, tripping a React hydration mismatch (#418) -- the same class of bug
-- fixed for the profile timeline in #130. Add `time_zone` so both renders agree.
--
-- Adding a column changes the function's RETURNS TABLE signature, which
-- CREATE OR REPLACE cannot do, so drop and recreate. The body is otherwise
-- identical. Grants are restated to match
-- 20260713151000_function_grant_hardening.sql (authenticated only; never
-- public/anon), because DROP FUNCTION discards them.

drop function if exists public.list_open_tables();

create function public.list_open_tables()
returns table (
  event_id uuid,
  title text,
  starts_at timestamptz,
  time_zone text,
  location_name text,
  host_name text,
  spots_left int,
  known_via text
) language sql stable security definer set search_path = public as $$
  with candidate as (
    select e.*, p.display_name as host_name,
      coalesce(e.capacity, 0) - (
        select count(*) from public.invites i
        where i.event_id = e.id and i.status = 'accepted'
      ) as spots_left
    from public.events e
    join public.profiles p on p.id = e.host_id
    where e.open_table
      and e.status in ('inviting', 'confirmed')
      and e.capacity is not null
      and (e.starts_at is null or e.starts_at > now())
      and e.host_id <> auth.uid()
      and not exists (
        select 1 from public.invites i
        where i.event_id = e.id and i.invitee_id = auth.uid()
      )
  )
  select c.id, c.title, c.starts_at, c.time_zone, c.location_name, c.host_name,
    c.spots_left::int,
    case
      when public.are_connected(auth.uid(), c.host_id) then c.host_name
      else (
        select pr.display_name from public.invites i
        join public.profiles pr on pr.id = i.invitee_id
        where i.event_id = c.id and i.status = 'accepted'
          and public.are_connected(auth.uid(), i.invitee_id)
        limit 1
      )
    end as known_via
  from candidate c
  where c.spots_left > 0
    and (
      public.are_connected(auth.uid(), c.host_id)
      or exists (
        select 1 from public.invites i
        where i.event_id = c.id and i.status = 'accepted'
          and i.invitee_id is not null
          and public.are_connected(auth.uid(), i.invitee_id)
      )
    );
$$;

revoke execute on function public.list_open_tables() from public, anon;
grant execute on function public.list_open_tables() to authenticated;
