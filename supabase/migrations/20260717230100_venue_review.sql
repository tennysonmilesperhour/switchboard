-- Venue claims become a reviewed lifecycle instead of instant-live listings.
--
-- NOTE: this file originally shared the version timestamp 20260717230000 with
-- the notification_preferences migration. Two migrations with the same version
-- collide on the schema_migrations primary key, which aborts a clean apply to a
-- fresh database ("duplicate key value violates unique constraint
-- schema_migrations_pkey"). It has been renamed to a unique version; every
-- statement here is already idempotent (add column / create index if not
-- exists, drop policy/trigger if exists, create or replace), so re-applying is
-- safe regardless of whether an environment already ran it under the old name.
--
-- Before: any authenticated user could insert a `venues` row (name + perk) with
-- themselves as `claimed_by`, and it was world-visible immediately
-- (venues_select `using (true)`) and even surfaced as a "perk for Switchboard
-- groups" banner on any event whose location string matched the venue name. So
-- anyone could attach a fabricated offer to a real business — a false-promise /
-- impersonation vector, and (per docs/SECURITY.md §3) a verification flag on a
-- self-writable row would be self-grantable.
--
-- After: a claim lands as `pending` and only becomes publicly visible once an
-- appointed platform moderator verifies it. The moderator queue reuses the
-- existing platform_moderators authority table + is_platform_moderator() gate
-- (20260713170000_moderation_queue.sql), exactly like the user-report queue.
--
-- Authority hygiene (SECURITY.md §2/§3):
--   * `status` (and the review bookkeeping columns) are authority state living on
--     a row the claimant can UPDATE, so they are frozen by a BEFORE UPDATE
--     trigger that only lets a platform moderator move them — the owner may edit
--     name/area/perk/url but can never self-verify. `claimed_by` is immutable.
--   * The INSERT policy pins the initial status to 'pending' so a crafted insert
--     cannot arrive pre-verified.
--   * SELECT is narrowed from `using (true)` to verified-or-own, so unreviewed
--     and rejected claims are not world-visible.
--
-- Existing rows: the NOT NULL default backfills every current claim to 'pending'.
-- That is intended — none of them went through review, so they must earn a
-- moderator's verification before they show publicly again.

alter table public.venues
  add column if not exists status text not null default 'pending'
    check (status in ('pending', 'verified', 'rejected')),
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text;

create index if not exists venues_pending_idx
  on public.venues (created_at)
  where status = 'pending';

create index if not exists venues_verified_idx
  on public.venues (created_at desc)
  where status = 'verified';

-- ————————————————————————— freeze authority columns —————————————————————————
-- `claimed_by` is immutable for everyone; the review columns move only when the
-- actor is a platform moderator. RLS cannot compare OLD vs NEW, so this trigger
-- is what actually keeps a claimant from self-verifying their own row. Modeled
-- on the freeze_* triggers in 20260712120000_authz_hardening.sql.
create or replace function public.freeze_venue_authority()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.claimed_by is distinct from old.claimed_by then
    raise exception 'venue owner is immutable';
  end if;
  if (new.status is distinct from old.status
      or new.reviewed_by is distinct from old.reviewed_by
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note)
     and not public.is_platform_moderator(auth.uid()) then
    raise exception 'venue review state is moderator-only';
  end if;
  return new;
end $$;

drop trigger if exists venues_freeze_authority on public.venues;
create trigger venues_freeze_authority
  before update on public.venues
  for each row execute function public.freeze_venue_authority();

-- ————————————————————————— tighten policies —————————————————————————
-- Only verified venues are public; a claimant can still see their own pending or
-- rejected claim (so the UI can show them its status). A moderator reads pending
-- rows through the definer queue below, not through this policy.
drop policy if exists venues_select on public.venues;
create policy venues_select on public.venues for select to authenticated
  using (status = 'verified' or claimed_by = auth.uid());

-- A claim is always born pending; it cannot arrive pre-verified.
drop policy if exists venues_insert on public.venues;
create policy venues_insert on public.venues for insert to authenticated
  with check (claimed_by = auth.uid() and status = 'pending');

-- The owner may edit the descriptive fields (the freeze trigger blocks the
-- authority columns). Kept explicit with WITH CHECK per SECURITY.md §2.
drop policy if exists venues_update on public.venues;
create policy venues_update on public.venues for update to authenticated
  using (claimed_by = auth.uid())
  with check (claimed_by = auth.uid());

-- ————————————————————————— moderator review queue —————————————————————————
-- Definer bodies live in the private schema with public SECURITY INVOKER
-- wrappers, matching 20260717192758_move_definer_bodies_private.sql.

-- List claims awaiting review, with the claimant's name. Non-moderators get an
-- empty set (the is_platform_moderator guard), so this is safe to expose.
create or replace function private.list_pending_venues()
returns table (
  id uuid,
  name text,
  area text,
  perk text,
  url text,
  claimed_by uuid,
  claimant_name text,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select v.id, v.name, v.area, v.perk, v.url,
         v.claimed_by, p.display_name, v.created_at
  from public.venues v
  left join public.profiles p on p.id = v.claimed_by
  where v.status = 'pending'
    and public.is_platform_moderator(auth.uid())
  order by v.created_at asc;
$$;
revoke all on function private.list_pending_venues() from public, anon;
grant execute on function private.list_pending_venues() to authenticated, service_role;

create or replace function public.list_pending_venues()
returns table (
  id uuid,
  name text,
  area text,
  perk text,
  url text,
  claimed_by uuid,
  claimant_name text,
  created_at timestamptz
) language sql stable security invoker set search_path = '' as $$
  select * from private.list_pending_venues();
$$;
revoke all on function public.list_pending_venues() from public, anon;
grant execute on function public.list_pending_venues() to authenticated, service_role;

-- Verify or reject a pending claim. Self-checks membership, records who/when,
-- and only acts on a still-pending row (idempotent against double review).
create or replace function private.review_venue(
  p_venue uuid,
  p_decision text,
  p_note text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_moderator(auth.uid()) then
    raise exception 'not authorized';
  end if;
  if p_decision not in ('verified', 'rejected') then
    raise exception 'invalid decision';
  end if;
  update public.venues
     set status = p_decision,
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = nullif(btrim(p_note), '')
   where id = p_venue and status = 'pending';
end $$;
revoke all on function private.review_venue(uuid, text, text) from public, anon;
grant execute on function private.review_venue(uuid, text, text) to authenticated, service_role;

create or replace function public.review_venue(
  p_venue uuid,
  p_decision text,
  p_note text default null
) returns void language sql security invoker set search_path = '' as $$
  select private.review_venue(p_venue, p_decision, p_note);
$$;
revoke all on function public.review_venue(uuid, text, text) from public, anon;
grant execute on function public.review_venue(uuid, text, text) to authenticated, service_role;
