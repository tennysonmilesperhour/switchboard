-- Re-home guest invites onto an account once the invited person signs up.
--
-- A guest invite is stored with invitee_id = null and a guest_contact /
-- guest_token. Every in-app surface (home, /plans, notifications) lists a
-- person's invitations with `where invitee_id = auth.uid()`, so an invite that
-- stays a guest row is invisible in the app — which is exactly what happens
-- after someone opens an invite link, creates an account, and then finds the
-- invitation gone from their app. These security-definer helpers link an
-- unclaimed guest invite to the authenticated account, either by the invite's
-- own token (they opened the link) or by matching the contact it was sent to.

-- Claim one specific guest invite by its token. Possession of the unguessable
-- token is the authorization: it's the same secret that lets a logged-out guest
-- RSVP. Returns the event id when something was linked (or a duplicate cleaned
-- up), else null. Idempotent — re-running once claimed is a no-op.
create or replace function public.claim_guest_invite(p_token uuid)
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

revoke all on function public.claim_guest_invite(uuid) from public, anon;
grant execute on function public.claim_guest_invite(uuid) to authenticated;

-- Claim every unclaimed guest invite that was sent to a contact this account
-- owns: its sign-in email, its opt-in contact_email, or its normalized phone.
-- Mirrors how resolve_profile_contact already treats those fields as identity
-- for finding people. Skips events where the account already has an invite.
-- Returns how many invites were linked.
create or replace function public.claim_guest_invites_by_contact()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_auth_email text;
  v_contact_email text;
  v_phone text;
  v_count integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_auth_email
    from auth.users u where u.id = v_uid;
  select lower(btrim(coalesce(p.contact_email, ''))), p.contact_phone_normalized
    into v_contact_email, v_phone
    from public.profiles p where p.id = v_uid;

  with candidates as (
    select i.id
      from public.invites i
     where i.invitee_id is null
       and i.guest_contact is not null
       and (
            (v_auth_email <> '' and lower(btrim(i.guest_contact)) = v_auth_email)
         or (v_contact_email <> '' and lower(btrim(i.guest_contact)) = v_contact_email)
         or (v_phone is not null and public.normalize_phone_number(i.guest_contact) = v_phone)
       )
       and not exists (
         select 1 from public.invites x
          where x.event_id = i.event_id
            and x.invitee_id = v_uid
       )
  ), linked as (
    update public.invites i
       set invitee_id = v_uid
      from candidates c
     where i.id = c.id
    returning 1
  )
  select count(*) into v_count from linked;
  return v_count;
end;
$$;

revoke all on function public.claim_guest_invites_by_contact() from public, anon;
grant execute on function public.claim_guest_invites_by_contact() to authenticated;
