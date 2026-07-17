-- Contact values are presentation data until their owner proves control. Only
-- verified rows participate in account matching and invitation routing.

create table public.profile_contacts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone')),
  value text not null,
  normalized_value text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

create unique index profile_contacts_verified_identity_idx
  on public.profile_contacts (kind, normalized_value)
  where verified_at is not null;

alter table public.profile_contacts enable row level security;
create policy profile_contacts_owner_select
  on public.profile_contacts for select to authenticated
  using (user_id = auth.uid());
grant select on public.profile_contacts to authenticated;
revoke insert, update, delete on public.profile_contacts from anon, authenticated;

create table public.contact_verification_requests (
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('email', 'phone')),
  normalized_value text not null,
  token_hash text,
  code_hash text,
  attempts int not null default 0 check (attempts between 0 and 10),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind),
  check (
    (kind = 'email' and token_hash is not null and code_hash is null)
    or (kind = 'phone' and token_hash is null and code_hash is not null)
  )
);

alter table public.contact_verification_requests enable row level security;
revoke all on public.contact_verification_requests from public, anon, authenticated;

create or replace function public.sync_profile_contacts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(new.contact_email, '')));
  v_phone text := public.normalize_phone_number(new.contact_phone);
begin
  if v_email = '' then
    delete from public.profile_contacts where user_id = new.id and kind = 'email';
  else
    insert into public.profile_contacts (user_id, kind, value, normalized_value)
    values (new.id, 'email', btrim(new.contact_email), v_email)
    on conflict (user_id, kind) do update set
      value = excluded.value,
      normalized_value = excluded.normalized_value,
      verified_at = case
        when public.profile_contacts.normalized_value = excluded.normalized_value
          then public.profile_contacts.verified_at
        else null
      end,
      updated_at = now();
  end if;

  if v_phone is null then
    delete from public.profile_contacts where user_id = new.id and kind = 'phone';
  else
    insert into public.profile_contacts (user_id, kind, value, normalized_value)
    values (new.id, 'phone', btrim(new.contact_phone), v_phone)
    on conflict (user_id, kind) do update set
      value = excluded.value,
      normalized_value = excluded.normalized_value,
      verified_at = case
        when public.profile_contacts.normalized_value = excluded.normalized_value
          then public.profile_contacts.verified_at
        else null
      end,
      updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sync_contacts on public.profiles;
create trigger profiles_sync_contacts
after insert or update of contact_email, contact_phone on public.profiles
for each row execute function public.sync_profile_contacts();

insert into public.profile_contacts (user_id, kind, value, normalized_value)
select id, 'email', btrim(contact_email), lower(btrim(contact_email))
from public.profiles
where contact_email is not null and btrim(contact_email) <> ''
on conflict (user_id, kind) do nothing;

insert into public.profile_contacts (user_id, kind, value, normalized_value)
select id, 'phone', btrim(contact_phone), public.normalize_phone_number(contact_phone)
from public.profiles
where public.normalize_phone_number(contact_phone) is not null
on conflict (user_id, kind) do nothing;

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
set search_path = ''
as $$
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
  where m.id <> auth.uid()
    and not public.are_blocked(auth.uid(), m.id)
  order by m.id, m.priority
  limit 1;
$$;

revoke all on function public.resolve_profile_contact(text) from public, anon;
grant execute on function public.resolve_profile_contact(text) to authenticated;
