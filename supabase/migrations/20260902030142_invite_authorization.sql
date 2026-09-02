-- A plan cannot be used to bypass a profile block, grow an unbounded recipient
-- list, or let a host manufacture somebody else's acceptance. Serialize every
-- insert on the event row so concurrent writers cannot race the 100-person cap.

create or replace function private.enforce_invite_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_host uuid;
  v_invite_count integer;
begin
  select e.host_id
    into v_host
    from public.events e
   where e.id = new.event_id
   for update;

  if v_host is null then
    raise exception 'event not found' using errcode = '23503';
  end if;

  if new.invitee_id is not null
     and public.are_blocked(v_host, new.invitee_id) then
    raise exception 'blocked profiles cannot be invited' using errcode = '42501';
  end if;

  select count(*)::integer
    into v_invite_count
    from public.invites i
   where i.event_id = new.event_id;

  if v_invite_count >= 100 then
    raise exception 'plan invite limit exceeded' using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_invite_insert() from public, anon, authenticated;
grant execute on function private.enforce_invite_insert() to service_role;

drop trigger if exists enforce_invite_insert on public.invites;
create trigger enforce_invite_insert
before insert on public.invites
for each row execute function private.enforce_invite_insert();

-- Hosts and co-hosts may enqueue or send an invitation, but RSVP states belong
-- exclusively to the invitee/guest response functions.
drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites
for insert to authenticated
with check (
  public.is_event_host(event_id, auth.uid())
  and status in ('queued', 'sent')
);
