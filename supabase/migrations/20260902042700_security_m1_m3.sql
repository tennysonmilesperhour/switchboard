-- Security remediation M1-M4.
--
-- 1. Digest contents are a server sweep primitive, not a user RPC.
-- 2. Authorization helpers that accept an arbitrary user id are policy
--    internals, not account-to-account query APIs.
-- 3. Contact matching enforces its enumeration throttle at the database
--    boundary, so a new caller cannot forget it.
-- 4. Recovery resolves canonical email ownership in auth.users, never a
--    self-writable profile field.

-- ————————————————————————— M1: digest is service-role only —————————————————
revoke execute on function public.digest_items(uuid)
  from public, anon, authenticated;
grant execute on function public.digest_items(uuid) to service_role;

-- ———————————————— M4: canonical auth-email resolution ————————————————————
-- PostgREST does not expose auth.users, so give the server one exact-match
-- primitive instead of paginating every auth account in application code.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from auth.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) =
        pg_catalog.lower(pg_catalog.btrim(p_email))
  limit 1;
$$;

revoke all on function public.auth_user_id_by_email(text)
  from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- ————————————————————— M2: unexposed policy helpers ————————————————————————
-- Zone helpers landed after the general private-body migration, so give RLS
-- an unexposed copy before removing authenticated access to the public,
-- arbitrary-user signatures.
create or replace function private.is_zone_member(p_zone uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (
      select 1 from public.zones z
      where z.id = p_zone and z.organizer_id = p_user
    )
    or exists (
      select 1 from public.zone_members m
      where m.zone_id = p_zone and m.member_id = p_user
    )
  );
$$;

create or replace function private.is_zone_moderator(p_zone uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    exists (
      select 1 from public.zones z
      where z.id = p_zone and z.organizer_id = p_user
    )
    or exists (
      select 1 from public.zone_members m
      where m.zone_id = p_zone
        and m.member_id = p_user
        and m.role = 'moderator'
    )
  );
$$;

create or replace function private.can_view_zone(p_zone uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.zones z
    where z.id = p_zone
      and (
        z.visibility = 'public'
        or private.is_zone_member(p_zone, p_user)
      )
  );
$$;

revoke all on function private.is_zone_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.is_zone_moderator(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.can_view_zone(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.is_zone_member(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.is_zone_moderator(uuid, uuid)
  to authenticated, service_role;
grant execute on function private.can_view_zone(uuid, uuid)
  to authenticated, service_role;

-- Policies created before 20260717192758 already follow the original function
-- OIDs into private. These are the policies created later; change only their
-- helper target and preserve every row predicate and WITH CHECK.
alter policy event_availability_own on public.event_availability
  with check (
    user_id = auth.uid()
    and private.can_view_event(event_id, auth.uid())
  );

alter policy poll_votes_own_update on public.poll_votes
  with check (
    voter_id = auth.uid()
    and private.can_view_event(
      (select p.event_id from public.polls p where p.id = poll_id),
      auth.uid()
    )
  );

alter policy board_post_responses_select on public.board_post_responses
  using (
    exists (
      select 1 from public.board_posts post
      where post.id = post_id
        and private.is_board_member(post.board_id, (select auth.uid()))
    )
  );

alter policy board_post_responses_insert on public.board_post_responses
  with check (
    responder_id = (select auth.uid())
    and exists (
      select 1 from public.board_posts post
      where post.id = post_id
        and post.author_id <> (select auth.uid())
        and post.kind in ('offer', 'request')
        and post.fulfilled_at is null
        and (post.expires_at is null or post.expires_at > now())
        and private.is_board_member(post.board_id, (select auth.uid()))
    )
  );

alter policy board_posts_update on public.board_posts
  using (
    author_id = (select auth.uid())
    and private.is_board_member(board_id, (select auth.uid()))
  )
  with check (
    author_id = (select auth.uid())
    and private.is_board_member(board_id, (select auth.uid()))
  );

alter policy zones_select on public.zones
  using (
    visibility = 'public'
    or private.is_zone_member(id, auth.uid())
  );
alter policy zones_update on public.zones
  using (private.is_zone_moderator(id, auth.uid()))
  with check (private.is_zone_moderator(id, auth.uid()));
alter policy zone_members_select on public.zone_members
  using (private.is_zone_member(zone_id, auth.uid()));
alter policy zone_members_insert on public.zone_members
  with check (private.is_zone_moderator(zone_id, auth.uid()));
alter policy zone_members_update on public.zone_members
  using (private.is_zone_moderator(zone_id, auth.uid()))
  with check (private.is_zone_moderator(zone_id, auth.uid()));
alter policy zone_members_delete on public.zone_members
  using (
    member_id = auth.uid()
    or private.is_zone_moderator(zone_id, auth.uid())
  );
alter policy zone_join_requests_select on public.zone_join_requests
  using (
    requester_id = auth.uid()
    or private.is_zone_moderator(zone_id, auth.uid())
  );
alter policy zone_join_requests_delete on public.zone_join_requests
  using (
    requester_id = auth.uid()
    or private.is_zone_moderator(zone_id, auth.uid())
  );

-- Browser-callable replacements bind the user side to auth.uid(). They can
-- answer "what is my relationship to this resource/person?", never query a
-- relationship between two other accounts.
create or replace function public.is_blocked_with(p_other uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.are_blocked(auth.uid(), p_other);
$$;
create or replace function public.is_connected_with(p_other uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.are_connected(auth.uid(), p_other);
$$;
create or replace function public.is_current_user_event_host(p_event uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_event_host(p_event, auth.uid());
$$;
create or replace function public.is_current_user_board_member(p_board uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_board_member(p_board, auth.uid());
$$;
create or replace function public.is_current_user_board_moderator(p_board uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_board_moderator(p_board, auth.uid());
$$;
create or replace function public.is_current_user_room_member(p_room uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_room_member(p_room, auth.uid());
$$;
create or replace function public.can_current_user_view_event(p_event uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_view_event(p_event, auth.uid());
$$;
create or replace function public.is_current_user_zone_member(p_zone uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_zone_member(p_zone, auth.uid());
$$;
create or replace function public.is_current_user_zone_moderator(p_zone uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_zone_moderator(p_zone, auth.uid());
$$;
create or replace function public.can_current_user_view_zone(p_zone uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_view_zone(p_zone, auth.uid());
$$;
create or replace function public.is_current_user_platform_moderator()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_platform_moderator(auth.uid());
$$;

revoke all on function public.is_blocked_with(uuid) from public, anon;
revoke all on function public.is_connected_with(uuid) from public, anon;
revoke all on function public.is_current_user_event_host(uuid) from public, anon;
revoke all on function public.is_current_user_board_member(uuid) from public, anon;
revoke all on function public.is_current_user_board_moderator(uuid) from public, anon;
revoke all on function public.is_current_user_room_member(uuid) from public, anon;
revoke all on function public.can_current_user_view_event(uuid) from public, anon;
revoke all on function public.is_current_user_zone_member(uuid) from public, anon;
revoke all on function public.is_current_user_zone_moderator(uuid) from public, anon;
revoke all on function public.can_current_user_view_zone(uuid) from public, anon;
revoke all on function public.is_current_user_platform_moderator() from public, anon;

grant execute on function public.is_blocked_with(uuid) to authenticated;
grant execute on function public.is_connected_with(uuid) to authenticated;
grant execute on function public.is_current_user_event_host(uuid) to authenticated;
grant execute on function public.is_current_user_board_member(uuid) to authenticated;
grant execute on function public.is_current_user_board_moderator(uuid) to authenticated;
grant execute on function public.is_current_user_room_member(uuid) to authenticated;
grant execute on function public.can_current_user_view_event(uuid) to authenticated;
grant execute on function public.is_current_user_zone_member(uuid) to authenticated;
grant execute on function public.is_current_user_zone_moderator(uuid) to authenticated;
grant execute on function public.can_current_user_view_zone(uuid) to authenticated;
grant execute on function public.is_current_user_platform_moderator() to authenticated;

-- This trigger runs with the caller's privileges. Point it at the private
-- helper before revoking the browser-callable arbitrary-user signature, or a
-- normal venue edit would fail while checking immutable review fields.
create or replace function public.freeze_venue_authority()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.claimed_by is distinct from old.claimed_by then
    raise exception 'venue owner is immutable';
  end if;
  if (new.status is distinct from old.status
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note)
     and not private.is_platform_moderator(auth.uid()) then
    raise exception 'venue review state is moderator-only';
  end if;
  return new;
end;
$$;

-- The arbitrary-user forms remain for policies/definers and the one trusted
-- service-role manager check, but are no longer executable by a browser role.
revoke execute on function public.are_blocked(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.are_connected(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_event_host(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_board_member(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_board_moderator(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_room_member(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_zone_member(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_zone_moderator(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.can_view_event(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.can_view_zone(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.is_platform_moderator(uuid)
  from public, anon, authenticated;

-- ——————————————————— M3: contact throttle at the oracle ———————————————————
create or replace function private.resolve_profile_contact(p_identifier text)
returns table (
  id uuid,
  display_name text,
  handle text,
  match_kind text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return;
  end if;

  if not public.consume_rate_limit(
    pg_catalog.md5('contact-match:' || v_user::text),
    10,
    60 * 60
  ) then
    return;
  end if;

  return query
  with input as (
    select
      lower(regexp_replace(btrim(coalesce(p_identifier, '')), '^@', '')) as handle_candidate,
      lower(btrim(coalesce(p_identifier, ''))) as email_candidate,
      public.normalize_phone_number(p_identifier) as phone_candidate
  ),
  matches as (
    select p.id, p.display_name, p.handle, 'handle'::text as match_kind, 1 as priority
    from public.profiles p, input i
    where i.handle_candidate ~ '^[a-z0-9_]{3,24}$'
      and p.handle = i.handle_candidate

    union all

    select p.id, p.display_name, p.handle, c.kind::text as match_kind, 2 as priority
    from public.profile_contacts c
    join public.profiles p on p.id = c.user_id
    join input i on true
    where c.kind = 'email'
      and c.verified_at is not null
      and c.normalized_value = i.email_candidate

    union all

    select p.id, p.display_name, p.handle, c.kind::text as match_kind, 3 as priority
    from public.profile_contacts c
    join public.profiles p on p.id = c.user_id
    join input i on true
    where c.kind = 'phone'
      and c.verified_at is not null
      and i.phone_candidate is not null
      and c.normalized_value = i.phone_candidate
  )
  select distinct on (m.id) m.id, m.display_name, m.handle, m.match_kind
  from matches m
  where m.id <> v_user
    and not private.are_blocked(v_user, m.id)
  order by m.id, m.priority
  limit 1;
end;
$$;

revoke all on function private.resolve_profile_contact(text)
  from public, anon;
grant execute on function private.resolve_profile_contact(text)
  to authenticated, service_role;

-- The earlier invoker wrapper was marked STABLE. It now reaches a durable
-- limiter write, so correct that declaration to VOLATILE.
create or replace function public.resolve_profile_contact(p_identifier text)
returns table (
  id uuid,
  display_name text,
  handle text,
  match_kind text
)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.resolve_profile_contact(p_identifier);
$$;

revoke all on function public.resolve_profile_contact(text) from public, anon;
grant execute on function public.resolve_profile_contact(text) to authenticated;
