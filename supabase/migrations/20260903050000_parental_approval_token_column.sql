-- The guardian token *is* the approval capability: whoever holds it can open
-- /approve/<token> and approve a minor's RSVP. parental_approvals_host_read
-- (20260811120000) lets a host or co-host read the pending row so the app can
-- show the guardian's name and address, but the row also carries the token in
-- plain text, so the same SELECT handed the host the guardian's decision.
--
-- RLS cannot withhold a column, so this follows the profiles precedent
-- (20260710120000_lock_sensitive_profile_columns.sql): drop the table-level
-- SELECT and grant back every column except `token`. Every app read of this
-- table goes through the service-role client after its own authorization
-- check, so no browser query loses a column it used.
revoke select on public.parental_approvals from anon, authenticated;

grant select (
  id,
  invite_id,
  event_id,
  guardian_email,
  guardian_name,
  status,
  responded_at,
  created_at
) on public.parental_approvals to authenticated;
