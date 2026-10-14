-- Staged reveal for matchmaker introductions.
--
-- Before both people say yes, an introduction says who suggested it and what
-- for, and nothing about the other person. This adds one thing to that
-- masked card: up to three interests or activities the two of them share.
-- It is the teaser that makes "someone a friend thinks you'd like" concrete
-- without saying who (docs/research/timeleft-onboarding.md, R5).
--
-- Rules:
--   * Only while the introduction is open. After a match the names are known.
--   * Only when BOTH people let discovery show their interests
--     (profiles.discovery_interests). Either one turning it off hides the hint
--     for both, so nobody learns the other's choices from a one-sided list.
--   * Only labels both people picked. Nothing either person picked alone is
--     ever shown, so the hint reveals no more about the stranger than that
--     they share something with you.

drop function if exists public.my_matchmaker_proposals();
drop function if exists private.my_matchmaker_proposals();

create function private.my_matchmaker_proposals()
returns table (
  id uuid,
  activity text,
  note text,
  proposer_name text,
  my_response text,
  status text,
  room_id uuid,
  other_name text,
  created_at timestamptz,
  shared text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.activity,
    p.note,
    prof.display_name,
    case when p.person_a = auth.uid() then p.a_response else p.b_response end,
    p.status,
    p.room_id,
    case when p.status = 'matched' then other.display_name else null end,
    p.created_at,
    case
      when p.status = 'open' and me.discovery_interests and other.discovery_interests then
        array(
          select s.label
          from (
            select unnest(coalesce(me.interests, '{}')) as label
            intersect
            select unnest(coalesce(other.interests, '{}'))
            union
            select unnest(coalesce(me.down_to, '{}'))
            intersect
            select unnest(coalesce(other.down_to, '{}'))
          ) s
          order by s.label
          limit 3
        )
      else '{}'::text[]
    end
  from public.matchmaker_proposals p
  join public.profiles prof on prof.id = p.proposer_id
  join public.profiles me on me.id = auth.uid()
  join public.profiles other
    on other.id = case when p.person_a = auth.uid() then p.person_b else p.person_a end
  where (p.person_a = auth.uid() or p.person_b = auth.uid())
    and p.status <> 'closed';
$$;

create function public.my_matchmaker_proposals()
returns table (
  id uuid,
  activity text,
  note text,
  proposer_name text,
  my_response text,
  status text,
  room_id uuid,
  other_name text,
  created_at timestamptz,
  shared text[]
)
language sql
set search_path = ''
as $$select * from private.my_matchmaker_proposals()$$;

revoke all on function private.my_matchmaker_proposals() from public, anon;
revoke all on function public.my_matchmaker_proposals() from public, anon;
grant execute on function private.my_matchmaker_proposals() to authenticated, service_role;
grant execute on function public.my_matchmaker_proposals() to authenticated, service_role;
