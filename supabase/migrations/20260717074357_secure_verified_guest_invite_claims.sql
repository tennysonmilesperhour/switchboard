-- Contact-based invite claiming must use identifiers the account actually
-- controls. Direct token claims remain possession-based, but a user cannot
-- type someone else's email/phone into their profile and adopt that person's
-- waiting invitations.

alter function public.claim_guest_invite(uuid) set search_path = '';

create or replace function public.claim_guest_invites_by_contact()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  with candidates as (
    select i.id
      from public.invites i
     where i.invitee_id is null
       and i.guest_contact is not null
       and (
         exists (
           select 1
             from auth.users u
            where u.id = v_uid
              and u.email_confirmed_at is not null
              and u.email is not null
              and u.email not like '%@users.switchboard.local'
              and lower(btrim(i.guest_contact)) = lower(btrim(u.email))
         )
         or exists (
           select 1
             from public.profile_contacts c
            where c.user_id = v_uid
              and c.verified_at is not null
              and (
                (
                  c.kind = 'email'
                  and c.normalized_value = lower(btrim(i.guest_contact))
                )
                or (
                  c.kind = 'phone'
                  and c.normalized_value = public.normalize_phone_number(i.guest_contact)
                )
              )
         )
       )
       and not exists (
         select 1
           from public.invites x
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

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260717074357'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
