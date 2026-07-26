-- Viewing an invitation needs no account. Answering one does.
--
-- The links a host texts stay wide open: `/i/<share_token>` and
-- `/rsvp/<guest_token>` render the plan for anyone holding the token, signed
-- out, on a device that has never heard of Switchboard. That half is the whole
-- point of a link you can put in a message, and nothing here narrows it.
--
-- What changes is the RSVP itself: the responder must be signed in. Every
-- answer then belongs to a real account — one the host can see, add to their
-- circles, and re-invite — instead of a name typed into a box by someone who
-- can never be reached again, and the guest gets their plan in the app rather
-- than in a single link they have to keep.
--
-- Enforced here as well as in the server action (`respondViaShareLink`) because
-- this function is the *only* path by which someone who was never invited can
-- mint an invite row (docs/SECURITY.md §5, §9). A gate that lives only in the
-- UI is one refactor away from not existing.
--
-- The token remains the authorization — being signed in is an additional
-- requirement, never a substitute for holding the link.

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

  -- No session, no answer. Checked before the plan is even resolved so that a
  -- signed-out caller learns nothing about the token it presented.
  if p_user is null then
    return query select 'auth_required'::text, null::uuid;
    return;
  end if;

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

  -- A visitor who is already on this plan answers their existing invite rather
  -- than minting a duplicate (invites has no uniqueness on
  -- (event_id, invitee_id), so this is the guard that prevents doubles).
  select * into v_invite
    from public.invites
   where event_id = v_event.id and invitee_id = p_user
   for update;

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

  -- Room access follows the account that answered.
  if v_status = 'accepted' and v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return query select v_status, v_invite.guest_token;
end $$;

-- Server-action-only, unchanged: the caller rate-limits (docs/SECURITY.md §9)
-- and resolves p_user from the session; anon/authenticated must not reach this
-- directly. Re-stated here because `create or replace` keeps existing grants and
-- a future recreate of this function must not quietly widen them.
revoke all on function public.rsvp_via_share_token(uuid, uuid, text, text, boolean) from public, anon, authenticated;
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
  select '20260726120000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
