-- Profile discovery by handle, email, or phone for friend search and contact
-- matching. This intentionally returns only profile identity fields.

create or replace function public.resolve_profile_contact(p_identifier text)
returns table (
  id uuid,
  display_name text,
  handle text,
  match_kind text
)
language sql
stable
security definer
set search_path = public
as $$
  with input as (
    select
      btrim(coalesce(p_identifier, '')) as raw,
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

    select p.id, p.display_name, p.handle, 'email'::text as match_kind, 2 as priority
    from public.profiles p, input i
    where i.email_candidate ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(coalesce(p.contact_email, '')) = i.email_candidate

    union all

    select p.id, p.display_name, p.handle, 'account_email'::text as match_kind, 3 as priority
    from public.profiles p
    join auth.users u on u.id = p.id
    join input i on true
    where i.email_candidate ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      and lower(coalesce(u.email, '')) = i.email_candidate

    union all

    select p.id, p.display_name, p.handle, 'phone'::text as match_kind, 4 as priority
    from public.profiles p, input i
    where i.phone_candidate is not null
      and p.contact_phone_normalized = i.phone_candidate
  )
  select distinct on (m.id) m.id, m.display_name, m.handle, m.match_kind
  from matches m
  where m.id <> auth.uid()
    and not public.are_blocked(auth.uid(), m.id)
  order by m.id, m.priority
  limit 1;
$$;

revoke all on function public.resolve_profile_contact(text) from public, anon;
grant execute on function public.resolve_profile_contact(text) to authenticated;
