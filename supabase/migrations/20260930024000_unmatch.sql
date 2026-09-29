-- Unmatch (G37).
--
-- A match was permanent: `matches` has a SELECT policy and nothing else, so the
-- only way out of one was to block the person, which says something much
-- stronger than "this isn't going anywhere". Unmatching is the ordinary exit:
--
--   * the match row goes, for both people (it is one shared row);
--   * both halves of the interest that made it are withdrawn, so neither
--     person's old "yes" can quietly re-match the pair — it takes both of them
--     choosing each other again;
--   * the match's own room is removed with it, messages included, the way an
--     unmatch works everywhere else. Anything worth a moderator's attention is
--     reported before this, and the Mutual screen says so at the point of
--     asking.
--
-- Either person may unmatch; neither is notified. A definer function because
-- the caller cannot delete the shared row, the other person's intent, or the
-- room under RLS, and each of those has to happen together or not at all.

create or replace function private.unmatch(p_match uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches%rowtype;
  v_other uuid;
begin
  if v_user is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;

  select * into v_match from public.matches m where m.id = p_match for update;
  if not found or v_user not in (v_match.user_a, v_match.user_b) then
    return 'not_found';
  end if;
  v_other := case when v_match.user_a = v_user then v_match.user_b else v_match.user_a end;

  update public.mutual_intents i
     set status = 'withdrawn'
   where i.activity = v_match.activity
     and i.kind = v_match.kind
     and i.status in ('active', 'matched')
     and (
       (i.author_id = v_user and i.target_id = v_other)
       or (i.author_id = v_other and i.target_id = v_user)
     );

  delete from public.matches m where m.id = p_match;

  -- Only a match room, and only when no other match still points at it.
  if v_match.room_id is not null then
    delete from public.rooms r
    where r.id = v_match.room_id
      and r.kind = 'match'
      and not exists (
        select 1 from public.matches other where other.room_id = r.id
      );
  end if;

  return 'unmatched';
end;
$$;

revoke all on function private.unmatch(uuid) from public, anon, authenticated;
grant execute on function private.unmatch(uuid) to authenticated, service_role;

create or replace function public.unmatch(p_match uuid)
returns text
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.unmatch(p_match);
$$;

revoke all on function public.unmatch(uuid) from public, anon;
grant execute on function public.unmatch(uuid) to authenticated;
