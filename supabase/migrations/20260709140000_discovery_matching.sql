-- Opt-in people discovery with anonymous mutual interest.

alter table public.profiles
  add column if not exists discoverable boolean not null default false,
  add column if not exists discovery_geography boolean not null default false,
  add column if not exists discovery_demographics boolean not null default false,
  add column if not exists discovery_interests boolean not null default true,
  add column if not exists discovery_involvements boolean not null default false,
  add column if not exists discovery_mutuals boolean not null default true,
  add column if not exists discovery_contexts text[] not null default '{}';

alter table public.mutual_intents drop constraint if exists mutual_intents_kind_check;
alter table public.mutual_intents add constraint mutual_intents_kind_check
  check (kind in ('down_to_connect', 'open_to_reschedule', 'discover_connect'));

create or replace function public.check_mutual_match()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_mirror public.mutual_intents%rowtype;
  v_room uuid;
begin
  select * into v_mirror from public.mutual_intents
    where author_id = new.target_id
      and target_id = new.author_id
      and activity = new.activity
      and kind = new.kind
      and status = 'active'
      and (
        kind in ('down_to_connect', 'discover_connect')
        or event_id is not distinct from new.event_id
      )
    limit 1
    for update;

  if found then
    insert into public.rooms (kind, title, created_by)
      values ('match', new.activity, new.author_id)
      returning id into v_room;
    insert into public.room_members (room_id, member_id)
      values (v_room, new.author_id), (v_room, new.target_id);
    insert into public.matches (user_a, user_b, activity, kind, event_id, room_id)
      values (least(new.author_id, new.target_id), greatest(new.author_id, new.target_id),
              new.activity, new.kind, new.event_id, v_room);
    update public.mutual_intents set status = 'matched' where id in (new.id, v_mirror.id);
  end if;
  return new;
end $$;

create or replace function public.list_discoverable_people(p_category text default 'all')
returns table (
  id uuid,
  display_name text,
  handle text,
  avatar_url text,
  tagline text,
  location text,
  pronouns text,
  categories text[],
  contexts text[],
  shared_interests text[],
  shared_down_to text[],
  mutual_friend_count int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select id, location, interests, down_to
    from public.profiles
    where id = auth.uid()
  ),
  my_friends as (
    select case
      when c.requester_id = auth.uid() then c.addressee_id
      else c.requester_id
    end as friend_id
    from public.connections c
    where c.status = 'accepted'
      and (c.requester_id = auth.uid() or c.addressee_id = auth.uid())
  ),
  candidate_friends as (
    select
      p.id as candidate_id,
      case
        when c.requester_id = p.id then c.addressee_id
        else c.requester_id
      end as friend_id
    from public.profiles p
    join public.connections c
      on c.status = 'accepted'
     and (c.requester_id = p.id or c.addressee_id = p.id)
    where p.discoverable
  ),
  scored as (
    select
      p.id,
      p.display_name,
      p.handle,
      p.avatar_url,
      p.tagline,
      case when p.discovery_geography then p.location else null end as location,
      case when p.discovery_demographics then p.pronouns else null end as pronouns,
      array_remove(array[
        case when p.discovery_geography then 'geography' end,
        case when p.discovery_demographics then 'demographics' end,
        case when p.discovery_interests then 'interests' end,
        case when p.discovery_involvements then 'involvements' end,
        case when p.discovery_mutuals then 'mutual friends' end
      ], null) as categories,
      case
        when cardinality(p.discovery_contexts) > 0 then p.discovery_contexts
        else coalesce(p.down_to, '{}')
      end as contexts,
      case when p.discovery_interests
        then array(select unnest(coalesce(p.interests, '{}')) intersect select unnest(coalesce(me.interests, '{}')))
        else '{}'::text[]
      end as shared_interests,
      array(select unnest(coalesce(p.down_to, '{}')) intersect select unnest(coalesce(me.down_to, '{}'))) as shared_down_to,
      case when p.discovery_mutuals
        then (
          select count(*)::int
          from candidate_friends cf
          join my_friends mf on mf.friend_id = cf.friend_id
          where cf.candidate_id = p.id
        )
        else 0
      end as mutual_friend_count
    from public.profiles p
    cross join me
    where p.discoverable
      and p.id <> auth.uid()
      and not coalesce(p.sabbatical, false)
      and not public.are_blocked(auth.uid(), p.id)
      and not exists (
        select 1 from public.connections c
        where c.status = 'accepted'
          and ((c.requester_id = auth.uid() and c.addressee_id = p.id)
            or (c.requester_id = p.id and c.addressee_id = auth.uid()))
      )
  )
  select *
  from scored
  where p_category = 'all'
     or p_category = any(categories)
  order by mutual_friend_count desc, cardinality(shared_interests) desc, display_name asc
  limit 40;
$$;

revoke all on function public.list_discoverable_people(text) from public, anon;
grant execute on function public.list_discoverable_people(text) to authenticated;
