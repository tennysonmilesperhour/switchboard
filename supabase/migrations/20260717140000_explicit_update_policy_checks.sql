-- Explicit UPDATE policy checks.
--
-- Postgres reuses USING as WITH CHECK when a policy omits WITH CHECK, but the
-- release gate treats implicit checks as too easy to miss. Recreate the
-- remaining public UPDATE policies with the same row predicate stated on both
-- sides.

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists capsule_update on public.capsule_entries;
create policy capsule_update on public.capsule_entries for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists venues_update on public.venues;
create policy venues_update on public.venues for update to authenticated
  using (claimed_by = auth.uid())
  with check (claimed_by = auth.uid());

drop policy if exists zones_update on public.zones;
create policy zones_update on public.zones for update to authenticated
  using (organizer_id = auth.uid())
  with check (organizer_id = auth.uid());

drop policy if exists room_items_update on public.room_items;
create policy room_items_update on public.room_items for update to authenticated
  using (public.is_room_member(room_id, auth.uid()))
  with check (public.is_room_member(room_id, auth.uid()));

drop policy if exists polls_update on public.polls;
create policy polls_update on public.polls for update to authenticated
  using (public.is_event_host(event_id, auth.uid()))
  with check (public.is_event_host(event_id, auth.uid()));

drop policy if exists poll_votes_own_update on public.poll_votes;
create policy poll_votes_own_update on public.poll_votes for update to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and public.can_view_event(
      (select p.event_id from public.polls p where p.id = poll_id),
      auth.uid()
    )
  );

drop policy if exists event_questions_update on public.event_questions;
create policy event_questions_update on public.event_questions for update to authenticated
  using (public.is_event_host(event_id, auth.uid()))
  with check (public.is_event_host(event_id, auth.uid()));

drop policy if exists invite_answers_update on public.invite_answers;
create policy invite_answers_update on public.invite_answers for update to authenticated
  using (
    exists (
      select 1
      from public.invites i
      where i.id = invite_id
        and i.invitee_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.invites i
      where i.id = invite_id
        and i.invitee_id = auth.uid()
    )
  );

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260717140000'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
