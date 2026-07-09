-- Phone-number invite resolution.
-- Store a deterministic E.164-ish phone key on profiles so an invite sent to
-- "(555) 123-4567" can find an account saved as "+1 555 123 4567".

create or replace function public.normalize_phone_number(p_value text)
returns text
language plpgsql
immutable
as $$
declare
  v_trimmed text := btrim(coalesce(p_value, ''));
  v_digits text := regexp_replace(coalesce(p_value, ''), '\D', '', 'g');
begin
  if v_digits = '' then
    return null;
  end if;

  if char_length(v_digits) = 10 then
    return '+1' || v_digits;
  end if;

  if char_length(v_digits) = 11 and left(v_digits, 1) = '1' then
    return '+' || v_digits;
  end if;

  if left(v_trimmed, 1) = '+'
    and char_length(v_digits) between 8 and 15 then
    return '+' || v_digits;
  end if;

  return null;
end $$;

alter table public.profiles
  add column if not exists contact_phone_normalized text
    generated always as (public.normalize_phone_number(contact_phone)) stored;

create index if not exists profiles_contact_phone_normalized_idx
  on public.profiles (contact_phone_normalized)
  where contact_phone_normalized is not null;
