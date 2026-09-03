-- The contact-match throttle (20260902042700, M3) returned *no rows* once a
-- person had used their ten lookups in an hour. To every caller that is
-- indistinguishable from "nobody has that email", so a host inviting a dozen
-- friends by address got the last two as unlinked guests with no error, and
-- People search said "no account matched" for the rest of the hour.
--
-- Two changes, same boundary:
-- 1. Exhaustion raises. The app maps the error to SB-RATE-LIMIT and says so.
-- 2. A handle-shaped identifier does not spend the bucket. Handles are public
--    (every profile is reachable at /u/<handle> and in People search), so a
--    handle lookup reveals nothing an enumeration bucket exists to protect.
--    Email and phone lookups, which are the account-existence oracle, still
--    consume it.
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
  v_handle text := lower(regexp_replace(btrim(coalesce(p_identifier, '')), '^@', ''));
  v_is_handle boolean := v_handle ~ '^[a-z0-9_]{3,24}$';
begin
  if v_user is null then
    return;
  end if;

  if not v_is_handle and not public.consume_rate_limit(
    pg_catalog.md5('contact-match:' || v_user::text),
    10,
    60 * 60
  ) then
    raise exception 'contact-match rate limit'
      using errcode = 'P0001',
            hint = 'SB-RATE-LIMIT';
  end if;

  return query
  with input as (
    select
      v_handle as handle_candidate,
      lower(btrim(coalesce(p_identifier, ''))) as email_candidate,
      public.normalize_phone_number(p_identifier) as phone_candidate
  ),
  matches as (
    select p.id, p.display_name, p.handle, 'handle'::text as match_kind, 1 as priority
    from public.profiles p, input i
    where v_is_handle
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
