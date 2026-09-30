-- "Show the invite list" does what it says (completion plan P3, decision D3).
--
-- `events.show_invite_list` and `events.show_expired` have been stored since
-- the first migration, set in the wizard and toggled on the plan page, and read
-- by nothing. A host who ticked "show the whole invite list" was told guests
-- could see everyone invited; they could not.
--
-- D3: build `show_invite_list`, retire `show_expired`.
--
-- The list crosses the invites table's owner/host-only RLS, so it goes through
-- one SECURITY DEFINER function that encodes the whole rule, rather than a
-- policy (which would expose every invite column, contact details included) or
-- a filter in the page (which the browser never has to run):
--   * only for someone who can view the plan (`can_view_event`), and only when
--     the host has switched the list on — managers see it regardless;
--   * only invitations that have actually gone out: sent, accepted, waitlisted,
--     or a yes held for a guardian. Never somebody still queued (they have not
--     been asked, and being listed would tell them and everyone else where they
--     stand in the host's line), never a decline, an expiry, a withdrawal, or
--     an Open Table request the host has not answered;
--   * identity fields only — name, handle, avatar — never `guest_contact`, and
--     a guest name that is really an email address or phone number is replaced
--     by "Guest", because it is the host's private note of how to reach them;
--   * a status only when "show who's in" is also on. With it off, everyone on
--     the list reads as `invited`: the invite list must not become a side door
--     to the RSVPs the host chose to keep private. A guardian-held yes always
--     reads as `invited`, so a minor's approval state is never on display.
--
-- `show_expired` is retired: the wizard and the plan page no longer offer it
-- and the app no longer writes it. The column stays, because
-- `create_event_atomic` and Run it back still name it and dropping it would
-- break plan creation for no gain; it is inert.

comment on column public.events.show_expired is
  'Retired 2026-09 (decision D3): never read, no longer offered or written by the app. Kept only so create_event_atomic and clones keep working.';

create or replace function private.event_invite_list(p_event uuid)
returns table (
  invite_id uuid,
  invitee_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  status text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.invitee_id,
    coalesce(
      nullif(btrim(p.display_name), ''),
      case
        when nullif(btrim(i.guest_name), '') is null then null
        when btrim(i.guest_name) = btrim(coalesce(i.guest_contact, '')) then null
        when i.guest_name like '%@%' then null
        when btrim(i.guest_name) ~ '^[+0-9 ().-]{7,}$' then null
        else btrim(i.guest_name)
      end,
      'Guest'
    ),
    p.handle,
    p.avatar_url,
    case
      when i.status in ('accepted', 'waitlisted')
        and (e.show_accepted or private.is_event_host(e.id, auth.uid()))
        then i.status
      else 'invited'
    end
  from public.events e
  join public.invites i on i.event_id = e.id
  left join public.profiles p on p.id = i.invitee_id
  where e.id = p_event
    and auth.uid() is not null
    and private.can_view_event(e.id, auth.uid())
    and (e.show_invite_list or private.is_event_host(e.id, auth.uid()))
    and i.status in ('sent', 'accepted', 'waitlisted', 'pending_approval')
  order by i.position;
$$;

create or replace function public.event_invite_list(p_event uuid)
returns table (
  invite_id uuid,
  invitee_id uuid,
  display_name text,
  handle text,
  avatar_url text,
  status text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.event_invite_list(p_event);
$$;

revoke all on function private.event_invite_list(uuid) from public, anon;
revoke all on function public.event_invite_list(uuid) from public, anon;
grant execute on function private.event_invite_list(uuid) to authenticated, service_role;
grant execute on function public.event_invite_list(uuid) to authenticated, service_role;
