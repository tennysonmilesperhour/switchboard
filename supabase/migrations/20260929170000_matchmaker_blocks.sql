-- A matchmaker intro must never pair two people who have blocked each other.
--
-- The insert policy only checked that the proposer is connected to both
-- people, and `respond_to_matchmaker` opened a shared match room once both
-- accepted, so a mutual friend could put someone in a private room with the
-- person who blocked them. Mutual already refuses a blocked pair (F6); this
-- closes the same hole on both matchmaker paths: the intro can't be created,
-- and an intro created before a block is closed instead of matched.

alter policy matchmaker_proposer_insert on public.matchmaker_proposals
  with check (
    proposer_id = auth.uid()
    and private.are_connected(auth.uid(), person_a)
    and private.are_connected(auth.uid(), person_b)
    and not private.are_blocked(person_a, person_b)
  );

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
