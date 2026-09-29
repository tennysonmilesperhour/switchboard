-- A matchmaker match is announced once.
--
-- `respond_to_matchmaker` returned the proposal's status unchanged for any
-- intro that was no longer open, so once a pair had matched, every later call
-- from either of them came back 'matched' too. The server action announces a
-- match on 'matched', so a double tap, a stale Home card, or a deliberate loop
-- sent "It's a match" to both people again each time.
--
-- Only the call that makes the match now returns 'matched'. Any later call on
-- an already-matched intro returns 'already_matched', which the action treats
-- as success without telling anyone. Everything else, including the block rule
-- from 20260929170000_matchmaker_blocks.sql, is unchanged.

create or replace function private.respond_to_matchmaker(p_proposal uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v public.matchmaker_proposals%rowtype;
  v_room uuid;
begin
  select * into v from public.matchmaker_proposals where id = p_proposal for update;
  if not found then raise exception 'proposal not found'; end if;
  if auth.uid() not in (v.person_a, v.person_b) then
    raise exception 'not your proposal';
  end if;
  -- The match was made by an earlier call, which announced it.
  if v.status = 'matched' then return 'already_matched'; end if;
  if v.status <> 'open' then return v.status; end if;

  -- A block placed after the intro was sent ends it, whichever side answers.
  if private.are_blocked(v.person_a, v.person_b) then
    update public.matchmaker_proposals set status = 'closed' where id = p_proposal;
    return 'closed';
  end if;

  if v.person_a = auth.uid() then
    update public.matchmaker_proposals
      set a_response = case when p_accept then 'accepted' else 'declined' end
      where id = p_proposal;
  else
    update public.matchmaker_proposals
      set b_response = case when p_accept then 'accepted' else 'declined' end
      where id = p_proposal;
  end if;

  select * into v from public.matchmaker_proposals where id = p_proposal;

  if v.a_response = 'declined' or v.b_response = 'declined' then
    update public.matchmaker_proposals set status = 'closed' where id = p_proposal;
    return 'closed';
  end if;

  if v.a_response = 'accepted' and v.b_response = 'accepted' then
    insert into public.rooms (kind, title, created_by)
      values ('match', v.activity, v.proposer_id)
      returning id into v_room;
    insert into public.room_members (room_id, member_id)
      values (v_room, v.person_a), (v_room, v.person_b);
    insert into public.matches (user_a, user_b, activity, kind, room_id)
      values (least(v.person_a, v.person_b), greatest(v.person_a, v.person_b),
              v.activity, 'down_to_connect', v_room);
    update public.matchmaker_proposals
      set status = 'matched', room_id = v_room where id = p_proposal;
    return 'matched';
  end if;
  return 'open';
end $$;

revoke all on function private.respond_to_matchmaker(uuid, boolean) from public, anon;
grant execute on function private.respond_to_matchmaker(uuid, boolean) to authenticated, service_role;
