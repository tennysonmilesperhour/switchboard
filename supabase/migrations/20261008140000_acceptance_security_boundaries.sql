-- Acceptance audit W16–W21. Sequenced after main's existing October 8 migrations.
begin;

-- Preserve existing mismatched legacy ballots for an operator to inspect.
-- NOT VALID still rejects every new/updated mismatched row immediately.
alter table public.poll_options add constraint poll_options_id_poll_unique unique (id, poll_id);
create index poll_votes_option_poll_idx on public.poll_votes(option_id, poll_id);
alter table public.poll_votes add constraint poll_votes_option_poll_fk
  foreign key (option_id, poll_id) references public.poll_options(id, poll_id)
  on delete cascade not valid;

alter policy poll_votes_own_insert on public.poll_votes with check (
  voter_id = (select auth.uid()) and exists (
    select 1 from public.poll_options o join public.polls p on p.id = o.poll_id
    where o.id = poll_votes.option_id and o.poll_id = poll_votes.poll_id
      and private.can_view_event(p.event_id, (select auth.uid()))
  )
);
alter policy poll_votes_own_update on public.poll_votes
  using (voter_id = (select auth.uid()))
  with check (
    voter_id = (select auth.uid()) and exists (
      select 1 from public.poll_options o join public.polls p on p.id = o.poll_id
      where o.id = poll_votes.option_id and o.poll_id = poll_votes.poll_id
        and private.can_view_event(p.event_id, (select auth.uid()))
    )
  );

create or replace function private.find_nearby_people(p_radius_m double precision)
 RETURNS TABLE(user_id uuid, distance_m double precision, latitude double precision, longitude double precision, headline text, emoji text, display_name text, handle text, avatar_url text, interests text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Round the caller before any cross-user spatial calculation. Otherwise a
  -- spoofed caller point remains a fine-grained probe even when targets are
  -- rounded.
  with me as (
    select
      round(latitude::numeric, 3)::double precision as lat,
      round(longitude::numeric, 3)::double precision as lng,
      visibility
    from public.live_locations
    where user_id = auth.uid()
      and expires_at > now()
      and not exists (
        select 1 from public.profiles me
        where me.id = auth.uid() and me.sabbatical
      )
    limit 1
  ),
  visible as (
    select
      ll.user_id,
      round(ll.latitude::numeric, 3)::double precision as latitude,
      round(ll.longitude::numeric, 3)::double precision as longitude,
      ll.headline,
      ll.emoji,
      p.display_name,
      p.handle,
      p.avatar_url,
      coalesce(p.interests, '{}'::text[]) as interests
    from public.live_locations ll
    cross join me
    join public.profiles p on p.id = ll.user_id
    where ll.user_id <> auth.uid()
      and ll.expires_at > now()
      and not public.are_blocked(auth.uid(), ll.user_id)
      and not private.is_suspended(ll.user_id)
      and not p.sabbatical
      -- Still being heard from: see the header.
      and ll.updated_at > now() - interval '15 minutes'
      and (me.visibility = 'sharers' or public.are_connected(auth.uid(), ll.user_id))
      and (
        ll.visibility = 'sharers'
        or (
          ll.visibility = 'connections'
          and public.are_connected(auth.uid(), ll.user_id)
        )
      )
  ),
  distanced as (
    select
      visible.*,
      -- Great-circle distance in metres (haversine, R = 6371 km), using only
      -- the rounded points above. LEAST protects asin from floating-point
      -- overshoot at antipodal coordinates.
      (
        2 * 6371000 * asin(least(1::double precision, sqrt(
          power(sin(radians(visible.latitude - me.lat) / 2), 2)
          + cos(radians(me.lat)) * cos(radians(visible.latitude))
            * power(sin(radians(visible.longitude - me.lng) / 2), 2)
        )))
      )::double precision as distance_m
    from me
    cross join visible
  )
  select
    distanced.user_id,
    distanced.distance_m,
    distanced.latitude,
    distanced.longitude,
    distanced.headline,
    distanced.emoji,
    distanced.display_name,
    distanced.handle,
    distanced.avatar_url,
    distanced.interests
  from distanced
  where distanced.distance_m <= greatest(0, coalesce(p_radius_m, 5000))
  order by distanced.distance_m
  limit 200;
$function$

;

create or replace function private.decide_give_space_notice(
  p_user uuid,
  p_event uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_user;
  v_committed boolean;
  v_existing boolean;
  v_overlap boolean;
begin
  if v_user is null or p_event is null then
    return false;
  end if;

  -- The commitment gate. Nothing below runs for someone who merely opened the
  -- plan, was invited to it, asked to join it, or used to be going.
  select exists (
    select 1
    from public.invites i
    where i.event_id = p_event
      and i.invitee_id = v_user
      and i.status = 'accepted'
  )
  into v_committed;
  if not v_committed then
    return false;
  end if;

  -- Already warned: hand back the frozen answer without looking at anybody's
  -- current whereabouts. This is the branch that makes a departure unobservable.
  select n.warned into v_existing
  from public.give_space_notices n
  where n.user_id = v_user and n.event_id = p_event;
  if v_existing then
    return true;
  end if;

  select exists (
    select 1 from public.events e
    join public.profile_avoids a on a.avoided_id = e.host_id
    where e.id = p_event and a.avoider_id = v_user and e.host_id <> v_user
  ) or exists (
    select 1
    from public.invites i
    join public.profile_avoids a
      on a.avoided_id = i.invitee_id
    where i.event_id = p_event
      and i.status = 'accepted'
      and a.avoider_id = v_user
      and i.invitee_id <> v_user
  )
  into v_overlap;

  insert into public.give_space_notices (user_id, event_id, warned)
  values (v_user, p_event, v_overlap)
  on conflict (user_id, event_id) do update
    -- Monotonic: a later evaluation may raise the bit, never lower it.
    set warned = public.give_space_notices.warned or excluded.warned;

  return v_overlap;
end;
$$;

-- A board row is member-readable; its join capability is moderator-only.
revoke select on public.boards from anon, authenticated;
grant select (id, slug, name, description, created_by, created_at)
  on public.boards to authenticated;

create or replace function public.join_zone_via_code(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_zone_id uuid;
  v_slug text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_code is null or char_length(btrim(p_code)) = 0 then return null; end if;

  select id, slug into v_zone_id, v_slug
    from public.zones where invite_code = p_code for update;
  if v_zone_id is null then return null; end if;

  -- Removal/denial is per person, not revoked by possession of an old link.
  if exists (
    select 1 from public.zone_join_requests
    where zone_id = v_zone_id and requester_id = auth.uid()
      and (status in ('removed', 'denied') or (status = 'pending' and asks > 1))
  ) then return null; end if;

  -- Never above 'member': a shared link cannot mint a moderator.
  insert into public.zone_members (zone_id, member_id, role)
    values (v_zone_id, auth.uid(), 'member')
    on conflict (zone_id, member_id) do nothing;

  -- A pending request is satisfied by walking in the front door.
  update public.zone_join_requests
    set status = 'approved'
    where zone_id = v_zone_id and requester_id = auth.uid() and status = 'pending';

  return v_slug;
end $$;

-- Serialize removal with code redemption before the removal decision is recorded.
create or replace function private.lock_zone_member_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.zones where id = old.zone_id for update;
  return old;
end;
$$;
revoke all on function private.lock_zone_member_removal() from public, anon, authenticated;
grant execute on function private.lock_zone_member_removal() to service_role;
create trigger zone_members_lock_removal before delete on public.zone_members
  for each row execute function private.lock_zone_member_removal();

-- Private announcements follow attendance/management, not broad plan readability.
alter policy announcements_select on public.announcements
  using (private.can_add_to_capsule(event_id, (select auth.uid())));

alter table public.messages add column announcement_id uuid
  references public.announcements(id) on delete cascade;
create index messages_announcement_idx on public.messages(announcement_id);

-- Older copies have no identity marker. Match one subsequent copy per
-- announcement, before the next identical announcement, never every equal
-- chat message or the newest announcement regardless of chronology.
do $$
declare a record;
begin
  for a in select x.*, e.room_id from public.announcements x
    join public.events e on e.id = x.event_id order by x.created_at, x.id loop
    update public.messages set announcement_id = a.id where id = (
      select m.id from public.messages m
      where m.announcement_id is null and m.room_id = a.room_id
        and m.sender_id = a.author_id and (m.body = a.body or m.body = '📣 ' || a.body)
        and m.created_at >= a.created_at
        and not exists (
          select 1 from public.announcements later where later.event_id = a.event_id
            and later.author_id = a.author_id and later.body = a.body
            and (later.created_at, later.id) > (a.created_at, a.id)
            and later.created_at <= m.created_at
        )
      order by m.created_at, m.id limit 1
    );
  end loop;
end;
$$;

alter policy messages_select on public.messages using (
  private.is_room_member(room_id, (select auth.uid())) and removed_at is null
  and (announcement_id is null or exists (
    select 1 from public.announcements a where a.id = announcement_id
  ))
);

-- Mirror in the same transaction: provider failures cannot lose the room copy.
create or replace function private.mirror_announcement()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_room uuid;
begin
  select room_id into v_room from public.events where id = new.event_id;
  if v_room is not null then
    insert into public.messages(room_id, sender_id, body, announcement_id)
    values (v_room, new.author_id, new.body, new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.mirror_announcement() from public, anon, authenticated;
grant execute on function private.mirror_announcement() to service_role;
create trigger announcements_mirror after insert on public.announcements
  for each row execute function private.mirror_announcement();

create or replace function private.guard_announcement_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.announcement_id is distinct from old.announcement_id
    or (old.announcement_id is not null and (
      new.body is distinct from old.body or new.room_id is distinct from old.room_id
      or new.sender_id is distinct from old.sender_id
    ))
  ) then raise exception 'announcement copies are immutable'; end if;
  if tg_op = 'INSERT' and new.announcement_id is not null
     and current_user in ('anon', 'authenticated') then
    raise exception 'announcement copies are server-written';
  end if;
  -- An old app instance may still fan out an untagged copy during rollout.
  -- Attach the same audience, or suppress the redundant copy already committed
  -- by the announcement trigger. Ordinary member chat is never deduplicated.
  if tg_op = 'INSERT' and new.announcement_id is null and current_user = 'service_role' then
    select a.id into new.announcement_id
    from public.announcements a join public.events e on e.id = a.event_id
    where e.room_id = new.room_id and a.author_id = new.sender_id
      and (new.body = a.body or new.body = '📣 ' || a.body)
    order by a.created_at desc, a.id limit 1;
    if new.announcement_id is not null and exists (
      select 1 from public.messages m where m.announcement_id = new.announcement_id
    ) then return null; end if;
  end if;
  return new;
end;
$$;
revoke all on function private.guard_announcement_message() from public, anon, authenticated;
grant execute on function private.guard_announcement_message() to service_role;
create trigger messages_guard_announcement before insert or update on public.messages
  for each row execute function private.guard_announcement_message();

commit;
