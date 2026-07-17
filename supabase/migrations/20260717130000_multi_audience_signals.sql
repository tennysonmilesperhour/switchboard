-- Multi-audience availability signals.
--
-- Signals used to target a single circle (or everyone) via a scalar
-- `circle_id`. People want to share their availability with several circles at
-- once — e.g. "Close Friends" AND "Neighbors" but not everyone — so the
-- audience becomes a set of circle ids on the signal row itself.
--
-- An empty `circle_ids` array keeps the old "everyone I know" default
-- (visibility is still gated by are_connected). A non-empty array means the
-- signal is visible to a connection who belongs to at least one listed circle.
--
-- Security: `circle_ids` is the owner's own audience choice on a row RLS already
-- scopes to the owner for writes (`signals_own`); it grants no authority and can
-- only narrow who sees the signal, so it is safe on a self-writable row. Because
-- an array element cannot carry an ON DELETE CASCADE foreign key, a deleted
-- circle simply stops matching viewers rather than deleting the signal.

alter table public.availability_signals
  add column circle_ids uuid[] not null default '{}';

-- Fold any existing single-circle audience into the new array.
update public.availability_signals
  set circle_ids = array[circle_id]
  where circle_id is not null;

-- The visibility policy reads the audience column, so recreate it against the
-- array before dropping the old scalar.
drop policy if exists signals_visible on public.availability_signals;
create policy signals_visible on public.availability_signals for select to authenticated
  using (
    user_id <> auth.uid()
    and expires_at > now()
    and public.are_connected(user_id, auth.uid())
    and (
      cardinality(circle_ids) = 0
      or exists (
        select 1 from public.circle_members cm
        where cm.circle_id = any (availability_signals.circle_ids)
          and cm.member_id = auth.uid()
      )
    )
  );

alter table public.availability_signals drop column circle_id;
