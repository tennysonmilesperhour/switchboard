-- W22/W24: eligibility and answers are enforced in the transaction that RSVPs.
begin;

create or replace function private.require_rsvp_profile(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.profiles%rowtype;
begin
  if p_user is null then raise exception 'Sign in to RSVP' using hint = 'SB-RSVP-AUTH'; end if;
  select * into p from public.profiles where id = p_user;
  if p.onboarded is distinct from true then
    raise exception 'Finish onboarding before answering this invitation' using hint = 'SB-RSVP-ONBOARDING';
  end if;
  if p.legal_terms_version is distinct from '2026-08-31' then
    raise exception 'Accept the current terms before answering this invitation' using hint = 'SB-RSVP-TERMS';
  end if;
  if private.is_suspended(p_user) then raise exception 'Account suspended' using hint = 'SB-AUTH-SUSPENDED'; end if;
end;
$$;
revoke all on function private.require_rsvp_profile(uuid) from public, anon, authenticated;
grant execute on function private.require_rsvp_profile(uuid) to service_role;

-- Call only after authorizing and locking the invitation/event. Never callable by a session.
create or replace function private.save_rsvp_answers(p_invite uuid, p_answers jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_event uuid; q record; a text; pair record;
begin
  select event_id into strict v_event from public.invites where id = p_invite;
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' then
    raise exception 'Answer the RSVP questions using the form' using hint = 'RSVP_VALIDATION';
  end if;
  -- Lock the question set while validating/persisting the same accepted response.
  for q in select * from public.event_questions where event_id = v_event order by id for share loop
    a := btrim(coalesce(p_answers ->> q.id::text, ''));
    if (q.required and a = '') or char_length(a) > 2000
       or (a <> '' and q.kind = 'choice' and not (a = any(q.options)))
       or (p_answers ? q.id::text and jsonb_typeof(p_answers -> q.id::text) <> 'string') then
      raise exception 'Complete the required questions and choose valid answers (maximum 2000 characters)'
        using hint = 'RSVP_VALIDATION';
    end if;
  end loop;
  for pair in select * from jsonb_each(p_answers) loop
    if not exists (select 1 from public.event_questions where event_id = v_event and id::text = pair.key) then
      raise exception 'A question changed. Refresh the invitation and answer again' using hint = 'RSVP_VALIDATION';
    end if;
  end loop;
  insert into public.invite_answers(invite_id, question_id, answer)
  select p_invite, question.id, btrim(p_answers ->> question.id::text)
  from public.event_questions question where question.event_id = v_event and btrim(coalesce(p_answers ->> question.id::text,'')) <> ''
  on conflict (invite_id, question_id) do update set answer = excluded.answer;
end;
$$;
revoke all on function private.save_rsvp_answers(uuid, jsonb) from public, anon, authenticated;
grant execute on function private.save_rsvp_answers(uuid, jsonb) to service_role;

create or replace function private.respond_to_invite(
  p_invite uuid,
  p_accept boolean,
  p_note text,
  p_answers jsonb
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
  perform private.require_rsvp_profile(auth.uid());
  select * into v_invite from public.invites where id = p_invite for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.invitee_id is distinct from auth.uid() then
    raise exception 'not your invite';
  end if;
  -- Changed (D17): a no can be revisited, nothing else can.
  if v_invite.status not in ('sent', 'declined') then
    return v_invite.status;
  end if;

  select * into v_event from public.events where id = v_invite.event_id for update;
  if v_event.status <> 'inviting' then
    return v_invite.status;
  end if;

  -- Changed (D17): a second no is not an answer to record, and a guardian's
  -- no is not the invitee's to take back.
  if v_invite.status = 'declined' then
    if not p_accept then
      return 'declined';
    end if;
    if (
      select a.status from public.parental_approvals a
       where a.invite_id = v_invite.id
       order by a.created_at desc, a.id desc
       limit 1
    ) = 'denied' then
      return 'declined';
    end if;
  end if;

  if not p_accept then
    update public.invites
       set status = 'declined', responded_at = now(), decline_note = nullif(p_note, '')
     where id = p_invite;
    return 'declined';
  end if;

  -- Guardian hold (D2): no seat, no room, until a guardian approves.
  if v_event.parental_approval then
    perform private.save_rsvp_answers(v_invite.id, p_answers);
    update public.invites
       set status = 'pending_approval', responded_at = now(),
           decline_note = null, decline_message = null
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
       set status = 'waitlisted', responded_at = now(),
           decline_note = null, decline_message = null
     where id = p_invite;
    return 'waitlisted';
  end if;

  -- A yes that follows a no leaves nothing of the no behind: the host's line
  -- would otherwise show "ask me again!" and a decline note beside a guest who
  -- is coming.
  perform private.save_rsvp_answers(v_invite.id, p_answers);
  update public.invites
     set status = 'accepted', responded_at = now(),
         decline_note = null, decline_message = null
   where id = p_invite;

  if v_event.room_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;
create or replace function private.respond_to_guest_invite(
  p_token uuid,
  p_accept boolean,
  p_user uuid,
  p_answers jsonb
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
  perform private.require_rsvp_profile(p_user);
  select * into v_invite
    from public.invites
   where guest_token = p_token
   for update;
  if not found then raise exception 'invite not found'; end if;
  if v_invite.invitee_id is not null and v_invite.invitee_id <> p_user then
    raise exception 'not your invite';
  end if;
  if v_invite.invitee_id is null then
    if exists (select 1 from public.invites where event_id = v_invite.event_id
      and invitee_id = p_user and id <> v_invite.id) then
      raise exception 'Use your existing invitation to this plan';
    end if;
    update public.invites set invitee_id = p_user where id = v_invite.id;
    v_invite.invitee_id := p_user;
  end if;
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
    perform private.save_rsvp_answers(v_invite.id, p_answers);
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

  perform private.save_rsvp_answers(v_invite.id, p_answers);
  update public.invites
     set status = 'accepted', responded_at = now()
   where id = v_invite.id;

  -- The verified responder now has the same room access as a direct invite.
  if v_event.room_id is not null and v_invite.invitee_id is not null then
    insert into public.room_members (room_id, member_id)
    values (v_event.room_id, v_invite.invitee_id)
    on conflict do nothing;
  end if;

  return 'accepted';
end;
$$;
create or replace function private.rsvp_via_share_token(
  p_token uuid,
  p_user uuid,
  p_name text,
  p_contact text,
  p_accept boolean,
  p_answers jsonb
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

  perform private.require_rsvp_profile(p_user);

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
    perform private.save_rsvp_answers(v_invite.id, p_answers);
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

  if v_status = 'accepted' then
    perform private.save_rsvp_answers(v_invite.id, p_answers);
  end if;
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
create or replace function private.claim_guest_invite(p_token uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.invites;
begin
  if v_uid is null then
    return null;
  end if;

  perform private.require_rsvp_profile(v_uid);

  select * into v_invite
    from public.invites
   where guest_token = p_token
     and invitee_id is null
   for update;
  if not found then
    return null;
  end if;

  -- If this account already has an invite for the event, the guest row is a
  -- duplicate of it — drop the guest row rather than leaving the person invited
  -- twice to the same plan.
  if exists (
    select 1 from public.invites
     where event_id = v_invite.event_id
       and invitee_id = v_uid
  ) then
    delete from public.invites where id = v_invite.id;
    return v_invite.event_id;
  end if;

  update public.invites
     set invitee_id = v_uid
   where id = v_invite.id;
  return v_invite.event_id;
end;
$$;

-- New argument-bearing wrappers; old RPC signatures remain compatible but cannot bypass validation.
create or replace function public.respond_to_invite(p_invite uuid, p_accept boolean, p_note text, p_answers jsonb)
returns text language sql security invoker set search_path = '' as $$
  select private.respond_to_invite(p_invite, p_accept, p_note, p_answers);
$$;
create or replace function private.respond_to_invite(p_invite uuid, p_accept boolean, p_note text default null)
returns text language sql security definer set search_path = '' as $$
  select private.respond_to_invite(p_invite, p_accept, p_note, '{}'::jsonb);
$$;
create or replace function public.respond_to_guest_invite(p_token uuid, p_accept boolean, p_user uuid, p_answers jsonb)
returns text language sql security invoker set search_path = '' as $$
  select private.respond_to_guest_invite(p_token, p_accept, p_user, p_answers);
$$;
create or replace function private.respond_to_guest_invite(p_token uuid, p_accept boolean)
returns text language sql security definer set search_path = '' as $$
  select private.respond_to_guest_invite(p_token, p_accept,
    (select invitee_id from public.invites where guest_token = p_token), '{}'::jsonb);
$$;
create or replace function public.rsvp_via_share_token(p_token uuid, p_user uuid, p_name text, p_contact text, p_accept boolean, p_answers jsonb)
returns table(outcome text, token uuid) language sql security invoker set search_path = '' as $$
  select * from private.rsvp_via_share_token(p_token, p_user, p_name, p_contact, p_accept, p_answers);
$$;
create or replace function public.rsvp_via_share_token(p_token uuid, p_user uuid, p_name text, p_contact text, p_accept boolean)
returns table(outcome text, token uuid) language sql security definer set search_path = '' as $$
  select * from private.rsvp_via_share_token(p_token, p_user, p_name, p_contact, p_accept, '{}'::jsonb);
$$;

revoke all on function public.respond_to_invite(uuid,boolean,text,jsonb), private.respond_to_invite(uuid,boolean,text,jsonb) from public,anon;
grant execute on function public.respond_to_invite(uuid,boolean,text,jsonb), private.respond_to_invite(uuid,boolean,text,jsonb) to authenticated,service_role;
revoke all on function public.respond_to_guest_invite(uuid,boolean,uuid,jsonb), private.respond_to_guest_invite(uuid,boolean,uuid,jsonb),
  public.rsvp_via_share_token(uuid,uuid,text,text,boolean,jsonb), private.rsvp_via_share_token(uuid,uuid,text,text,boolean,jsonb)
  from public,anon,authenticated;
grant execute on function public.respond_to_guest_invite(uuid,boolean,uuid,jsonb), private.respond_to_guest_invite(uuid,boolean,uuid,jsonb),
  public.rsvp_via_share_token(uuid,uuid,text,text,boolean,jsonb), private.rsvp_via_share_token(uuid,uuid,text,text,boolean,jsonb)
  to service_role;

-- Direct answer writes must match this invitation's event and the question's kind.
create or replace function private.validate_invite_answer()
returns trigger language plpgsql security definer set search_path = '' as $$
declare q public.event_questions%rowtype; v_event uuid;
begin
  select event_id into v_event from public.invites where id = new.invite_id;
  select * into q from public.event_questions where id = new.question_id;
  if q.event_id is distinct from v_event or v_event is null
     or btrim(new.answer) = '' or char_length(new.answer) > 2000
     or (q.kind = 'choice' and not (btrim(new.answer) = any(q.options))) then
    raise exception 'Invalid RSVP answer' using hint = 'RSVP_VALIDATION';
  end if;
  new.answer := btrim(new.answer);
  return new;
end;
$$;
revoke all on function private.validate_invite_answer() from public,anon,authenticated;
grant execute on function private.validate_invite_answer() to service_role;
create or replace trigger invite_answers_validate before insert or update on public.invite_answers
  for each row execute function private.validate_invite_answer();

-- This backstop also protects guardian/host approval and future alternate writers.
create or replace function private.require_invite_answers()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('accepted', 'pending_approval') then return new; end if;
  if tg_op = 'UPDATE' and new.status = old.status then return new; end if;
  if exists (
    select 1 from public.event_questions q
    where q.event_id = new.event_id and q.required and not exists (
      select 1 from public.invite_answers a where a.invite_id = new.id and a.question_id = q.id
        and btrim(a.answer) <> '' and (q.kind <> 'choice' or a.answer = any(q.options))
    )
  ) then raise exception 'Complete required RSVP questions before accepting' using hint = 'RSVP_VALIDATION'; end if;
  return new;
end;
$$;
revoke all on function private.require_invite_answers() from public,anon,authenticated;
grant execute on function private.require_invite_answers() to service_role;
create or replace trigger invites_require_answers before insert or update of status on public.invites
  for each row execute function private.require_invite_answers();

CREATE OR REPLACE FUNCTION private.approve_join_request(p_invite uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- The host can welcome someone, but cannot answer their intake or terms for them.
  if exists (select 1 from public.event_questions q
      where q.event_id = v_event.id and q.required and not exists (
        select 1 from public.invite_answers a where a.invite_id = v_invite.id
          and a.question_id = q.id and btrim(a.answer) <> ''
          and (q.kind <> 'choice' or a.answer = any(q.options))))
     or not exists (select 1 from public.profiles p where p.id = v_invite.invitee_id
       and p.onboarded and p.legal_terms_version = '2026-08-31') then
    update public.invites set status = 'sent', sent_at = now(),
      window_minutes = 1440 where id = p_invite;
    return 'sent';
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
$function$;

CREATE OR REPLACE FUNCTION private.handle_sms_command(p_phone text, p_command text, p_code text, p_sid text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare j public.sms_jobs%rowtype; i public.invites%rowtype; e public.events%rowtype; v_outcome text; v_count integer;
begin
 if p_phone !~ '^\+[1-9][0-9]{7,14}$' or p_sid !~ '^SM[0-9a-fA-F]{32}$' then return ''; end if;
 if p_command not in ('JOIN','YES','NO','CONFIRM','UNKNOWN') then return ''; end if;
 insert into public.sms_inbound_receipts(sid) values(p_sid) on conflict do nothing;
 get diagnostics v_count=row_count;
 if v_count=0 then return ''; end if;
 if exists(select 1 from public.sms_opt_outs where normalized_number=p_phone) then return ''; end if;
 if p_command='UNKNOWN' then return 'To RSVP, reply YES or NO followed by the code in your invitation text. Use CONFIRM plus its code to confirm attendance. Open the plan for other requests. Reply STOP to stop texts or HELP for help.'; end if;
 if p_command='JOIN' then
  if p_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return 'Open your invitation to subscribe to its texts.'; end if;
  select * into i from public.invites where guest_token=p_code::uuid for update;
  if not found or i.invitee_id is not null or i.status not in ('sent','accepted') then return 'Open your invitation to manage notifications. SB-SMS-REPLY'; end if;
  select * into e from public.events where id=i.event_id;
  if e.status not in ('inviting','confirmed','deciding') or (e.starts_at is not null and e.starts_at<=now()) then return 'This invitation is no longer taking text subscriptions. SB-SMS-REPLY'; end if;
  -- A forwarded invitation cannot replace an earlier subscriber's number.
  if exists(select 1 from public.guest_sms_consents where invite_id=i.id and phone<>p_phone and expires_at>now()) then return 'This invitation already has a text subscriber. Ask your host for your own invitation. SB-SMS-REPLY'; end if;
  insert into public.guest_sms_consents(invite_id,phone,expires_at) values(i.id,p_phone,least(coalesce(e.ends_at,e.starts_at+interval '6 hours',now()+interval '30 days'),now()+interval '30 days'))
  on conflict(invite_id) do update set consent_at=now(),expires_at=excluded.expires_at,phone=excluded.phone;
  return 'Subscribed to texts for this invitation only. No account was created. Sign in through your invitation to RSVP. Reply STOP to stop all texts or HELP for help. Msg & data rates may apply.';
 end if;
 select * into j from public.sms_jobs where reply_code=upper(p_code) and phone=p_phone and user_id is not null and invite_id is not null and expires_at>now() and status in ('sending','accepted','queued','sending_provider','sent','delivered','unknown');
 if not found then return 'That reply code is unavailable. Open the plan to respond. SB-SMS-REPLY'; end if;
 perform 1 from public.profile_contacts c join public.sms_preferences s on s.user_id=c.user_id and s.phone=c.normalized_value where c.user_id=j.user_id and c.kind='phone' and c.normalized_value=p_phone and c.verified_at is not null and s.enabled for share of c,s;
 if not found then return 'Verify your current phone in Settings, then open the plan to respond. SB-SMS-REPLY'; end if;
 select * into i from public.invites where id=j.invite_id and invitee_id=j.user_id for update;
 if not found then return 'Open the plan to respond. SB-SMS-REPLY'; end if;
 select * into e from public.events where id=i.event_id for update;
 if e.status not in ('inviting','confirmed','deciding') or (e.starts_at is not null and e.starts_at<=now()) or public.are_blocked(e.host_id,j.user_id) then return 'This plan is no longer taking text replies. Open the plan for details. SB-SMS-REPLY'; end if;
 if e.parental_approval or exists(select 1 from public.event_questions where event_id=e.id and required) then return 'This plan needs additional details. Open it to finish your RSVP. SB-SMS-REPLY'; end if;
 if i.status='accepted' and p_command in ('YES','CONFIRM') then return 'You are confirmed as attending. Your host can see your RSVP.'; end if;
 if p_command='CONFIRM' or i.status<>'sent' then return 'Open the plan to view or change your RSVP. SB-SMS-REPLY'; end if;
 if not exists(select 1 from public.profiles p where p.id=j.user_id and p.onboarded and p.legal_terms_version='2026-08-31')
    then return 'Open your invitation to finish your profile and review the current terms. SB-SMS-REPLY'; end if;
 -- Reuse the same event lock, capacity and room-membership transition as web RSVP.
 v_outcome := public.respond_to_guest_invite(i.guest_token,p_command='YES');
 if v_outcome='accepted' then
  insert into public.notifications(user_id,kind,title,body,url) values(e.host_id,'rsvp_accepted','Someone is in','An invitation to '||left(e.title,100)||' was accepted by text.','/events/'||e.id);
  return 'You are in! Your host can see your RSVP.';
 elsif v_outcome='waitlisted' then return 'The plan is full. You are on the waitlist; this is not a confirmed place.';
 elsif v_outcome='declined' then return 'Your decline is saved. Your host can see your RSVP.';
 end if;
 return 'Open the plan to respond. SB-SMS-REPLY';
end $function$;

CREATE OR REPLACE FUNCTION private.request_to_join(p_event uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_event public.events%rowtype;
  v_id uuid;
  v_pos int;
begin
  perform private.require_rsvp_profile(auth.uid());
  select * into v_event from public.events where id = p_event for update;
  if not found or not v_event.open_table then
    raise exception 'event is not open';
  end if;
  if exists (select 1 from public.invites where event_id = p_event and invitee_id = auth.uid()) then
    raise exception 'already involved';
  end if;
  select coalesce(max(position), -1) + 1 into v_pos from public.invites where event_id = p_event;
  insert into public.invites (event_id, invitee_id, position, group_stage, window_minutes, status)
    values (p_event, auth.uid(), v_pos, 999, 1440, 'requested')
    returning id into v_id;
  return v_id;
end $function$;
commit;
