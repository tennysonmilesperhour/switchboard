-- One public, unguessable link per event — the "text it to anyone" link.
--
-- Why this exists: a plan had three link shapes with three different
-- preconditions, and the two the host could most easily reach were the two that
-- break for a recipient tapping a link in a text message:
--
--   /events/<id>   RLS-gated. Dead for anyone who isn't already an invitee.
--   /join/<id>     Needs an account, host approval, and events.open_table.
--   /rsvp/<token>  Works signed out — but it is per-invite, so the host has no
--                  such link for someone they haven't already added.
--
-- events.share_token is the missing fourth thing: one stable, unguessable URL
-- per plan that a stranger can open with no account, on any device, and RSVP
-- from. Possession of the token is the authorization (docs/SECURITY.md §5, the
-- same precedent as guest_token and calendar_token).
--
-- Security posture:
--   * The token is minted by the database, never by the client, and is frozen
--     against direct UPDATE — it may only move through rotate_event_share_token,
--     which re-checks host/co-host. A host can therefore invalidate a link they
--     over-shared, but nobody can pin it to a guessable value.
--   * RSVP through the link runs in a SECURITY DEFINER function that re-locks
--     the event row, honours capacity, and refuses closed/cancelled plans. It is
--     granted to service_role only: the caller is always a server action that
--     has rate-limited the request and resolved the viewer with auth.getUser().
--     auth.uid() is null under the service role, so the caller id is passed
--     explicitly (docs/SECURITY.md §5).
--   * share_link_active is the host's kill switch. It defaults to TRUE in the
--     DATABASE — deliberately not in a client useState, which is how the
--     previous "default invite links to on" fix (#95) missed every event not
--     created through the wizard.

alter table public.events
  add column if not exists share_token uuid unique default gen_random_uuid();

alter table public.events
  add column if not exists share_link_active boolean not null default true;

-- Backfill before the freeze trigger exists, so existing plans get a live link.
update public.events
   set share_token = gen_random_uuid()
 where share_token is null;

alter table public.events
  alter column share_token set not null;

-- ————————————————————————— token immutability —————————————————————————
-- events_update lets a host/co-host write their own event row, and RLS cannot
-- compare OLD vs NEW. Pin share_token with a BEFORE UPDATE trigger (the
-- freeze_* precedent from 20260712120000_authz_hardening.sql) and let only the
-- rotate function below lift it, via a transaction-local flag.
create or replace function public.freeze_event_share_token()
returns trigger language plpgsql as $$
begin
  if new.share_token is distinct from old.share_token
     and coalesce(current_setting('app.rotating_share_token', true), '') <> 'on' then
    raise exception 'event share token is immutable; use rotate_event_share_token()';
  end if;
  return new;
end $$;

drop trigger if exists events_freeze_share_token on public.events;
create trigger events_freeze_share_token
  before update on public.events
  for each row execute function public.freeze_event_share_token();

-- Rotate the link, invalidating anything already shared. Host/co-host only.
create or replace function public.rotate_event_share_token(p_event uuid, p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token uuid;
begin
  if p_user is null then raise exception 'not signed in'; end if;
  if not public.is_event_host(p_event, p_user) then
    raise exception 'not a host of this plan';
  end if;

  v_token := gen_random_uuid();
  -- Transaction-local (third arg true): never leaks to another statement.
  perform set_config('app.rotating_share_token', 'on', true);
  update public.events set share_token = v_token where id = p_event;
  perform set_config('app.rotating_share_token', 'off', true);
  return v_token;
end $$;

-- ————————————————————————— RSVP through the link —————————————————————————
-- Mint (or reuse) an invite for whoever opened the share link and record their
-- answer, atomically under the event row lock so capacity can never be exceeded
-- by concurrent link RSVPs racing each other or a cascade accept.
--
-- Returns the invite's guest_token alongside the outcome so the caller can send
-- the guest onward to their own durable /rsvp/<token> page — the same surface a
-- directly-invited guest gets, with calendar links and the ability to change
-- their answer later.
create or replace function public.rsvp_via_share_token(
  p_token uuid,
  p_user uuid,
  p_name text,
  p_contact text,
  p_accept boolean
)
returns table (outcome text, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_invite public.invites%rowtype;
  v_accepted integer;
  v_cap integer;
  v_position integer;
  v_name text;
  v_contact text;
  v_status text;
begin
  if p_token is null then return; end if;

  select * into v_event from public.events where share_token = p_token for update;
  if not found then return; end if;

  -- The host's kill switch, and plans that aren't taking answers.
  if not v_event.share_link_active then
    return query select 'link_off'::text, null::uuid;
    return;
  end if;
  if v_event.status not in ('inviting', 'confirmed') then
    return query select 'not_accepting'::text, null::uuid;
    return;
  end if;

  -- Untrusted display text: trim and cap. It is stored as data and rendered by
  -- React (escaped), never concatenated into markup.
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  v_contact := nullif(btrim(coalesce(p_contact, '')), '');
  if v_name is not null then v_name := left(v_name, 80); end if;
  if v_contact is not null then v_contact := left(v_contact, 255); end if;

  -- A signed-in visitor who is already on this plan answers their existing
  -- invite rather than minting a duplicate (invites has no uniqueness on
  -- (event_id, invitee_id), so this is the guard that prevents doubles).
  if p_user is not null then
    select * into v_invite
      from public.invites
     where event_id = v_event.id and invitee_id = p_user
     for update;
  end if;

  if v_invite.id is null then
    if v_name is null then
      return query select 'name_required'::text, null::uuid;
      return;
    end if;

    select coalesce(max(position), -1) + 1 into v_position
      from public.invites where event_id = v_event.id;

    insert into public.invites
      (event_id, invitee_id, guest_name, guest_contact, position, status, sent_at)
    values
      (v_event.id, p_user, v_name, v_contact, v_position, 'sent', now())
    returning * into v_invite;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now()
     where id = v_invite.id
     returning * into v_invite;
    return query select 'declined'::text, v_invite.guest_token;
    return;
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';

  -- Only an EXPLICIT capacity caps a share link.
  --
  -- respond_to_guest_invite treats invite_mode='individual' (the default) as an
  -- implicit capacity of 1, because that mode describes the ordered cascade:
  -- ask one person at a time, stop at the first yes. A link the host chose to
  -- broadcast is the opposite intent — and inheriting the implicit 1 would
  -- waitlist every recipient after the first, which reads to them as exactly
  -- the same "this link is broken" the share link exists to fix. A host who
  -- wants a hard cap sets capacity.
  v_cap := v_event.capacity;

  v_status := case
    when v_cap is not null and v_accepted >= v_cap and v_invite.status <> 'accepted'
      then 'waitlisted'
    else 'accepted'
  end;

  update public.invites
     set status = v_status, responded_at = now()
   where id = v_invite.id
   returning * into v_invite;

  -- Mirror respond_to_guest_invite: room access follows an account, never a
  -- token-only guest.
  if v_status = 'accepted' and v_event.room_id is not null and v_invite.invitee_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return query select v_status, v_invite.guest_token;
end $$;

-- Server-action-only. The callers rate-limit (docs/SECURITY.md §9) and resolve
-- p_user from the session; anon/authenticated must not reach these directly.
revoke all on function public.rotate_event_share_token(uuid, uuid) from public, anon, authenticated;
revoke all on function public.rsvp_via_share_token(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.rotate_event_share_token(uuid, uuid) to service_role;
grant execute on function public.rsvp_via_share_token(uuid, uuid, text, text, boolean) to service_role;

-- Keep the drift detector honest: /api/health compares this against
-- EXPECTED_SCHEMA_VERSION, and a stale value there is why "the guest link reads
-- a database missing this migration" stopped being an alarm anyone trusted.
create or replace function public.app_schema_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '20260724120000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
