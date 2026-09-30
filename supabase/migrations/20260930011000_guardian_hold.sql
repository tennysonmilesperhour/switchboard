-- A guardian-approval RSVP is held, not counted (completion plan P2, D2).
--
-- Until now a plan with `parental_approval` counted every yes immediately: the
-- invite became `accepted`, took a seat, joined the Living Room, and was
-- reminded like anyone else. The guardian's link could only take that back
-- (denial cancelled it). Worse, the in-app RSVP never asked for a guardian at
-- all, and a yes whose guardian step was abandoned — a closed tab — simply
-- stayed counted forever.
--
-- Decision D2: hold it. Every RSVP path on such a plan now writes the new
-- invite status `pending_approval` instead of `accepted`. A held yes
--   * takes no seat: every capacity check counts `status = 'accepted'` only,
--     here and in the cascade engine (`spotsRemaining`), so it is invisible to
--     them without further change;
--   * joins no room, gets no reminders and no "going" notifications, appears
--     in no attendee list or calendar feed — all of those read `accepted`;
--   * does not block the cascade: it is not `sent`, so the line moves on, and
--     it is not cancelled when the plan fills (the fill sweep retires only
--     queued, sent and requested rows), because the guardian's answer decides
--     it, not the clock;
--   * survives a closed tab: the status is on the invite, so every surface that
--     shows the invitee their invitation can show "waiting on a guardian" and
--     offer to (re)send the request.
-- The guardian's approval makes it count, re-checking capacity at that moment
-- (full → waitlisted, the same answer a late yes gets). Denial releases it.
--
-- Why a status rather than a flag on `accepted`: a flag would have to be
-- excluded explicitly from every one of the ~40 places that count or list
-- accepted invites, and the first place anybody forgot would hand a seat to a
-- minor nobody had approved. A status is excluded by default.

-- ————————————————————————— 1. the new status —————————————————————————
alter table public.invites drop constraint if exists invites_status_check;
alter table public.invites add constraint invites_status_check
  check (status in (
    'queued', 'sent', 'accepted', 'declined', 'expired', 'cancelled',
    'waitlisted', 'requested', 'pending_approval'
  ));

-- ————————————————————————— 2. the share link —————————————————————————
-- Copied from 20260731120000_rsvp_while_deciding.sql; the only change is the
-- guardian hold after the decline branch.
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

  -- Guardian hold (D2). A yes on a plan that needs a guardian's OK waits
  -- without a seat. One that already counts (approved earlier) is left alone.
  if v_event.parental_approval and v_invite.status <> 'accepted' then
    update public.invites
       set status = 'pending_approval', responded_at = now()
     where id = v_invite.id
     returning * into v_invite;
    return query select 'pending_approval'::text, v_invite.guest_token;
    return;
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';

  -- Only an EXPLICIT capacity caps a share link (see 20260731120000).
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

-- Server-action-only, unchanged (see 20260731120000).
revoke all on function public.rsvp_via_share_token(uuid, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.rsvp_via_share_token(uuid, uuid, text, text, boolean)
  to service_role;

-- ————————————————————————— 3. the in-app RSVP —————————————————————————
-- Copied from 20260717081000_restore_event_room_membership.sql (moved to
-- `private` by 20260717192758), with the guardian hold and fully qualified
-- names. The public invoker wrapper is unchanged.
create or replace function private.respond_to_invite(
  p_invite uuid,
  p_accept boolean,
  p_note text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted integer;
  v_cap integer;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.invitee_id is distinct from auth.uid() then
    raise exception 'not your invite';
  end if;
  if v_invite.status <> 'sent' then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now(), decline_note = p_note
     where id = p_invite;
    return 'declined';
  end if;

  -- Guardian hold (D2): no seat, no room, until a guardian approves.
  if v_event.parental_approval then
    update public.invites
       set status = 'pending_approval', responded_at = now()
     where id = p_invite;
    return 'pending_approval';
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites
       set status = 'waitlisted', responded_at = now()
     where id = p_invite;
    return 'waitlisted';
  end if;

  update public.invites
     set status = 'accepted', responded_at = now()
   where id = p_invite;

  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;

revoke all on function private.respond_to_invite(uuid, boolean, text) from public, anon;
grant execute on function private.respond_to_invite(uuid, boolean, text)
  to authenticated, service_role;

-- ————————————————————————— 4. the guest token RSVP —————————————————————————
-- Copied from 20260909011500_sms_coordination.sql with the guardian hold. The
-- SMS reply path calls this too, but refuses guardian plans before it does
-- ("This plan needs additional details"), so a text can never reach the hold.
create or replace function private.respond_to_guest_invite(
  p_token uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted integer;
  v_cap integer;
begin
  select * into v_invite
    from public.invites
   where guest_token = p_token
   for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.status <> 'sent' then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status not in ('deciding', 'inviting', 'confirmed') then
    return v_invite.status;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now()
     where id = v_invite.id;
    return 'declined';
  end if;

  -- Guardian hold (D2).
  if v_event.parental_approval then
    update public.invites
       set status = 'pending_approval', responded_at = now()
     where id = v_invite.id;
    return 'pending_approval';
  end if;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );

  if v_cap is not null and v_accepted >= v_cap then
    update public.invites
       set status = 'waitlisted', responded_at = now()
     where id = v_invite.id;
    return 'waitlisted';
  end if;

  update public.invites
     set status = 'accepted', responded_at = now()
   where id = v_invite.id;

  -- Unregistered guests remain token-only. Once a guest invite has been claimed
  -- by an account, accepting it grants the same room access as a direct invite.
  if v_event.room_id is not null and v_invite.invitee_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;

revoke all on function private.respond_to_guest_invite(uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.respond_to_guest_invite(uuid, boolean) to service_role;

-- ————————————————————————— 5. Open Table approval —————————————————————————
-- Copied from 20260704140000_wave2.sql (moved to `private` by 20260717192758).
-- The host's yes to a join request is not the guardian's: on a guardian plan
-- it moves the request to the same hold, and the requester is asked for a
-- guardian from their own invitation.
create or replace function private.approve_join_request(p_invite uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites%rowtype;
  v_event public.events%rowtype;
  v_accepted integer;
begin
  select * into v_invite from public.invites where id = p_invite for update;
  if not found or v_invite.status <> 'requested' then return 'gone'; end if;
  select * into v_event from public.events where id = v_invite.event_id for update;
  if not private.is_event_host(v_event.id, auth.uid()) then
    raise exception 'host only';
  end if;

  if v_event.parental_approval then
    update public.invites
       set status = 'pending_approval', responded_at = now()
     where id = p_invite;
    return 'pending_approval';
  end if;

  select count(*) into v_accepted from public.invites
    where event_id = v_event.id and status = 'accepted';
  if v_event.capacity is not null and v_accepted >= v_event.capacity then
    update public.invites set status = 'waitlisted', responded_at = now() where id = p_invite;
    return 'waitlisted';
  end if;
  update public.invites set status = 'accepted', responded_at = now() where id = p_invite;
  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
      values (v_event.room_id, v_invite.invitee_id)
      on conflict do nothing;
  end if;
  return 'accepted';
end;
$$;

revoke all on function private.approve_join_request(uuid) from public, anon;
grant execute on function private.approve_join_request(uuid) to authenticated, service_role;

-- ————————————————————————— 6. the guardian's answer —————————————————————————
-- Token-addressed and deliberately executable by `anon`: the guardian usually
-- has no account, and the token is the whole authorization. That is also why
-- this body stays in `public` rather than behind a private invoker wrapper —
-- `anon` has no USAGE on schema `private`.
--
-- Approving a held yes makes it count, with capacity re-checked under the
-- event lock at this moment (the same rule the in-app RSVP uses): a seat if
-- one is free, the waitlist if not. A yes recorded before this migration
-- (already `accepted`, approval still pending) keeps its seat as before.
-- Denial releases a held yes (`declined`) and still withdraws a legacy one.
-- Everything is checked before anything is written; a cross-plan row stays
-- inert (20260902022127).
create or replace function public.resolve_parental_approval(
  p_token text,
  p_approve boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_approval public.parental_approvals%rowtype;
  v_event public.events%rowtype;
  v_invite public.invites%rowtype;
  v_accepted integer;
  v_cap integer;
  v_status text;
begin
  select * into v_approval
    from public.parental_approvals
   where token = p_token
   for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  if v_approval.status <> 'pending' then
    return jsonb_build_object(
      'outcome', 'already_resolved',
      'status', v_approval.status
    );
  end if;

  -- Invite, then event: the lock order every RSVP path for a single invite
  -- takes, so a guardian answering while the invitee re-answers serializes
  -- instead of deadlocking.
  select * into v_invite from public.invites where id = v_approval.invite_id for update;
  if not found then
    return jsonb_build_object('outcome', 'invite_gone');
  end if;

  select * into v_event from public.events where id = v_approval.event_id for update;
  if not found then
    return jsonb_build_object('outcome', 'event_gone');
  end if;

  -- The invite and approval must describe the same plan. Check this before
  -- either table is mutated, so a cross-plan row is inert even under the
  -- SECURITY DEFINER owner.
  if v_invite.event_id is distinct from v_approval.event_id then
    return jsonb_build_object('outcome', 'invite_mismatch');
  end if;

  if not p_approve then
    update public.parental_approvals
       set status = 'denied', responded_at = now()
     where id = v_approval.id;

    if v_invite.status = 'pending_approval' then
      update public.invites
         set status = 'declined', responded_at = now()
       where id = v_invite.id;
    elsif v_invite.status = 'accepted' then
      update public.invites
         set status = 'cancelled', responded_at = now()
       where id = v_invite.id;
    end if;

    return jsonb_build_object(
      'outcome', 'denied',
      'event_title', v_event.title
    );
  end if;

  -- A yes recorded before holds existed: it already counts, so approving only
  -- records the guardian's answer.
  if v_invite.status = 'accepted' then
    update public.parental_approvals
       set status = 'approved', responded_at = now()
     where id = v_approval.id;
    return jsonb_build_object(
      'outcome', 'approved',
      'event_title', v_event.title,
      'invite_status', 'accepted'
    );
  end if;

  -- The yes was withdrawn (declined, removed from the line, expired) before
  -- the guardian got to it. Nothing to approve; the link stays usable if the
  -- invitee says yes again.
  if v_invite.status <> 'pending_approval' then
    return jsonb_build_object('outcome', 'invite_gone');
  end if;

  -- A plan that was called off or has happened takes no more answers.
  if v_event.status not in ('deciding', 'inviting', 'confirmed') then
    return jsonb_build_object(
      'outcome', 'event_closed',
      'event_title', v_event.title
    );
  end if;

  update public.parental_approvals
     set status = 'approved', responded_at = now()
   where id = v_approval.id;

  select count(*) into v_accepted
    from public.invites
   where event_id = v_event.id and status = 'accepted';
  v_cap := coalesce(
    v_event.capacity,
    case when v_event.invite_mode = 'individual' then 1 else null end
  );
  v_status := case
    when v_cap is not null and v_accepted >= v_cap then 'waitlisted'
    else 'accepted'
  end;

  update public.invites
     set status = v_status, responded_at = now()
   where id = v_invite.id;

  if v_status = 'accepted'
     and v_event.room_id is not null
     and v_invite.invitee_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'outcome', 'approved',
    'event_title', v_event.title,
    'invite_status', v_status
  );
end;
$$;

revoke all on function public.resolve_parental_approval(text, boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_parental_approval(text, boolean)
  to anon, authenticated, service_role;

-- ————————————————————————— 7. the invariant, in one place ——————————————————
-- Every path above holds a guardian plan's yes. This trigger is what keeps
-- that true for the next path somebody writes, or a later migration that
-- re-creates one of these functions from an older copy: on a guardian plan an
-- invite may only become `accepted` once its guardian has approved. Anything
-- else fails loudly instead of quietly handing out a seat.
create or replace function private.guard_guardian_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.events e
    where e.id = new.event_id and e.parental_approval
  ) and not exists (
    select 1 from public.parental_approvals a
    where a.invite_id = new.id
      and a.event_id = new.event_id
      and a.status = 'approved'
  ) then
    raise exception 'guardian approval required'
      using hint = 'SB-RSVP-APPROVAL';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_guardian_hold() from public, anon, authenticated;
grant execute on function private.guard_guardian_hold() to service_role;

drop trigger if exists invites_guardian_hold on public.invites;
create trigger invites_guardian_hold
  before update of status on public.invites
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function private.guard_guardian_hold();

-- ————————————————————————— 8. yeses already counted ——————————————————————
-- Upcoming guardian plans may already hold yeses nobody approved: counted the
-- moment they were given, some with a guardian request still pending, some
-- whose guardian step was abandoned in a closed tab. Hold them too, so the
-- rule is the same for every seat on a plan that is still ahead. A yes whose
-- guardian already approved keeps its seat, and past or cancelled plans are
-- history and left alone. Room membership already granted is not revoked
-- here; the invitee is told on the plan that their yes is waiting.
update public.invites i
   set status = 'pending_approval'
  from public.events e
 where e.id = i.event_id
   and e.parental_approval
   and e.status in ('deciding', 'inviting', 'confirmed')
   and (e.starts_at is null or e.starts_at > now())
   and i.status = 'accepted'
   and not exists (
     select 1 from public.parental_approvals a
      where a.invite_id = i.id and a.status = 'approved'
   );

-- The host panel and the invitee's own "waiting on a guardian" card look up
-- the pending request for an invite.
create index if not exists parental_approvals_invite_status
  on public.parental_approvals (invite_id, status);

-- ————————————————————————— 9. did the email go? ——————————————————————————
-- "We've emailed the guardian" used to show whether or not the provider took
-- the message. The send path now records what actually happened to the most
-- recent email for this request (the values of `DeliveryStatus` in
-- src/lib/server/email.ts), so a reload — the invitee's or the host's — still
-- says "we couldn't email them" rather than quietly implying it arrived. Null
-- means the request predates this column.
alter table public.parental_approvals
  add column if not exists email_status text
    check (email_status in (
      'sent', 'not_configured', 'invalid_recipient', 'opted_out', 'failed'
    ));

-- Readable wherever the guardian's address already is (the token stays
-- withheld; see 20260903050000_parental_approval_token_column.sql).
grant select (email_status) on public.parental_approvals to authenticated;
