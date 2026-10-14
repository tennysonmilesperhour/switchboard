-- "Why you two" in a match room.
--
-- A match room opened with no explanation, so two people who matched on
-- something specific had to guess what it was. Timeleft's most common
-- complaint is that people doubt the matching uses anything they said; the
-- answer is to show it. This returns what the app already knows about why a
-- pair matched, for the two people in the room and nobody else:
--
--   kind           how they matched (down_to_connect, discover_connect,
--                  hang_again), from the matches row for this room
--   activity       what they matched over
--   shared         up to three things both picked (private.shared_picks: only
--                  when both let discovery show their interests)
--   event_title    the plan both were at, for a hang_again match
--   introduced_by  the friend who introduced them, for a matchmaker match
--
-- Nothing here is new information to either person: both said yes, both can
-- see each other's profile, and the plan and the introducer were already
-- known to both. It is gathered in one place so the room can say it.

create function private.match_room_why(p_room uuid)
returns table (
  kind text,
  activity text,
  shared text[],
  event_title text,
  introduced_by text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.kind,
    m.activity,
    private.shared_picks(
      auth.uid(),
      case when m.user_a = auth.uid() then m.user_b else m.user_a end
    ),
    case when m.kind = 'hang_again' then e.title end,
    intro.display_name
  from public.matches m
  left join public.events e on e.id = m.event_id
  left join lateral (
    select prof.display_name
    from public.matchmaker_proposals mp
    join public.profiles prof on prof.id = mp.proposer_id
    where mp.room_id = m.room_id
    limit 1
  ) intro on true
  where m.room_id = p_room
    and auth.uid() in (m.user_a, m.user_b)
    and private.is_room_member(p_room, auth.uid())
  limit 1
$$;

create function public.match_room_why(p_room uuid)
returns table (
  kind text,
  activity text,
  shared text[],
  event_title text,
  introduced_by text
)
language sql
set search_path = ''
as $$select * from private.match_room_why(p_room)$$;

revoke all on function private.match_room_why(uuid) from public, anon;
revoke all on function public.match_room_why(uuid) from public, anon;
grant execute on function private.match_room_why(uuid) to authenticated, service_role;
grant execute on function public.match_room_why(uuid) to authenticated, service_role;
