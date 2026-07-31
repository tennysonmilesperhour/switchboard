-- A plan whose date is still being picked can take an answer through its link.
--
-- Until now `rsvp_via_share_token` refused any status outside
-- ('inviting', 'confirmed'), so a plan created with a date poll — status
-- `deciding` for as long as the poll runs — could not be answered at all. The
-- app compounded that by refusing to even render the plan, which is what
-- recipients experienced as "This invite link isn't active" (fixed separately in
-- src/lib/share-link.ts). Rendering it and then withholding the buttons is only
-- half an answer: a person who taps a link to a barbecue wants to say they're
-- coming, and "we haven't settled Saturday vs Sunday" is not a reason to refuse
-- them. The date arrives later; the yes does not have to wait for it.
--
-- Why this is safe to widen:
--
--   * The cascade never runs on a `deciding` plan (advanceEventCascade returns
--     early unless status = 'inviting', as does apply_cascade_updates), so an
--     invite minted here cannot race the ordered send. It simply sits accepted
--     until the host closes the poll.
--   * spotsRemaining() counts accepted invites, so when the poll resolves and
--     the cascade does start, these answers already occupy their spots and the
--     line is drawn correctly behind them. Explicit capacity is still honoured
--     here under the event row lock.
--   * events_select already admits an invitee whose invite is not `queued`, and
--     admits everyone while the event is `deciding` (20260707140000), so
--     somebody who accepts here can open the plan and vote on the date — which
--     is the point. They are answering the plan and joining the decision, not
--     bypassing it.
--   * Answering remains gated on a real session and on holding the token. This
--     widens WHEN a link may be answered, never WHO may answer it.
--
-- `draft`, `cancelled` and `past` stay refused. Nothing about them is waiting on
-- a decision the recipient can be part of.

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
  -- This tuple is mirrored by ANSWERABLE_EVENT_STATUSES in src/lib/share-link.ts
  -- and compared against this file by src/lib/share-link.test.ts. Changing one
  -- side without the other fails that test — a page offering buttons this
  -- function will refuse is a broken link with extra steps.
  if v_event.status not in ('deciding', 'inviting', 'confirmed') then
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
-- directly. Re-stated because `create or replace` keeps existing grants and a
-- future recreate of this function must not quietly widen them.
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
  select '20260731120000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
