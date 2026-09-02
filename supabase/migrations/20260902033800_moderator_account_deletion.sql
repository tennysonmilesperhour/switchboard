-- Keep a moderator's decisions for the audit trail without keeping the
-- moderator's account alive. Both review columns are nullable bookkeeping:
-- deleting the referenced profile should clear the actor, not block the
-- auth.users -> profiles cascade used by account deletion.

alter table public.user_reports
  drop constraint if exists user_reports_resolved_by_fkey;
alter table public.user_reports
  add constraint user_reports_resolved_by_fkey
  foreign key (resolved_by) references public.profiles(id) on delete set null;

alter table public.venues
  drop constraint if exists venues_reviewed_by_fkey;
alter table public.venues
  add constraint venues_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles(id) on delete set null;

-- The venue authority trigger predates both account-deletion paths. PostgreSQL
-- implements ON DELETE SET NULL as an UPDATE, so the old trigger rejected the
-- FK's own cleanup as an attempted authority edit. Permit only the narrow case
-- where a claimed_by/reviewed_by value is being cleared after that profile has
-- already disappeared; all caller-driven authority changes stay moderator-only.
create or replace function public.freeze_venue_authority()
returns trigger language plpgsql set search_path = public as $$
declare
  v_claimant_cleared_for_delete boolean;
  v_reviewer_cleared_for_delete boolean;
begin
  v_claimant_cleared_for_delete :=
    old.claimed_by is not null
    and new.claimed_by is null
    and not exists (
      select 1 from public.profiles p where p.id = old.claimed_by
    );
  v_reviewer_cleared_for_delete :=
    old.reviewed_by is not null
    and new.reviewed_by is null
    and not exists (
      select 1 from public.profiles p where p.id = old.reviewed_by
    );

  if new.claimed_by is distinct from old.claimed_by
     and not v_claimant_cleared_for_delete then
    raise exception 'venue owner is immutable';
  end if;

  if (new.status is distinct from old.status
      or (new.reviewed_by is distinct from old.reviewed_by
          and not v_reviewer_cleared_for_delete)
      or new.reviewed_at is distinct from old.reviewed_at
      or new.review_note is distinct from old.review_note)
     and not public.is_platform_moderator(auth.uid()) then
    raise exception 'venue review state is moderator-only';
  end if;
  return new;
end $$;
