-- Corrective migration for 20260717140000_explicit_update_policy_checks.sql.
--
-- The poll_votes_own_update UPDATE policy shipped in that migration verified the
-- new poll_id mapped to a viewable event but did NOT bind option_id to that
-- poll_id. Because poll_votes stores poll_id and option_id as independent
-- foreign keys (no composite FK), a voter could UPDATE their own vote row to
-- point option_id at an option belonging to a DIFFERENT poll -- poisoning that
-- other poll's aggregate tallies via public.poll_results(). Found by independent
-- review after 20260717140000 was already merged and applied to production, so
-- it is corrected here (append-only) rather than by editing the shipped file.
--
-- Fix: require, in the WITH CHECK, that the chosen option belongs to the named
-- poll (o.id = option_id AND o.poll_id = poll_id) and that the poll's event is
-- viewable by the voter. Ownership (voter_id = auth.uid()) is preserved.

drop policy if exists poll_votes_own_update on public.poll_votes;
create policy poll_votes_own_update on public.poll_votes for update to authenticated
  using (voter_id = auth.uid())
  with check (
    voter_id = auth.uid()
    and exists (
      select 1
      from public.poll_options o
      join public.polls p on p.id = o.poll_id
      where o.id = poll_votes.option_id
        and o.poll_id = poll_votes.poll_id
        and public.can_view_event(p.event_id, auth.uid())
    )
  );
