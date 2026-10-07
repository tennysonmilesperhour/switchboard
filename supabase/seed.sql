-- Local / CI seed (run by `supabase start` and `supabase db reset`; NOT applied
-- to production by `db push`).
--
-- The schema deliberately carries no table-level GRANTs: a hosted Supabase
-- project grants the `anon` / `authenticated` / `service_role` roles access to
-- public tables automatically, and Row-Level Security is the real gate. A bare
-- local stack doesn't reproduce that auto-grant, so without this the roles can't
-- reach the tables at all (`permission denied for table ...`) and the pgTAP
-- suite — which exercises policies as the `authenticated` role — can't run.
-- `service_role` needs it too: the authenticated-E2E seed (e2e/seed.mjs) writes
-- fixtures through the service-role admin client.
--
-- The job here is to make local and CI behave like production. Where a
-- migration has deliberately made production LESS permissive than the hosted
-- default, this file has to leave that alone — a seed that hands back what a
-- migration took away doesn't set up the database, it edits the schema, and it
-- does it in the one place no test is looking.

grant usage on schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;

-- The Twilio webhook and outbound send guard are service-role-only. Preserve
-- the migration's explicit browser revocation after the hosted-default grant
-- simulation above.
revoke insert, update, delete on public.sms_opt_outs from anon, authenticated;

-- A Give Space notice is decided once, by a definer function, at the moment its
-- owner accepts an invitation — and then frozen. An owner who could rewrite
-- their own row could set `warned` back to false and re-run the evaluation,
-- which reads off whether the person they avoid has since dropped out: exactly
-- the departure probe 20260916210002_give_space_notices.sql exists to refuse.
-- RLS already denies it (there is no UPDATE or DELETE policy), but an RLS-denied
-- UPDATE matches zero rows in silence rather than raising, so preserve the
-- migration's revoke here too and keep the refusal loud.
revoke insert, update, delete on public.give_space_notices from anon, authenticated;

-- Availability is replaced through one atomic, grid-validating RPC. Re-granting
-- direct writes here would make local/CI looser than production and let a client
-- bypass both the response marker and slot validation.
revoke insert, update, delete on public.event_availability from anon, authenticated;
revoke insert, update, delete on public.event_availability_responses from anon, authenticated;

-- Expense shares are written only by the split-the-bill definer functions
-- (20260930022000), which keep every expense's shares summing to its amount.
revoke insert, update, delete on public.expense_shares from anon, authenticated;

-- The moderation audit trail is written only by the moderator definer
-- functions (20260930070000); nobody may write or rewrite it from the API.
revoke insert, update, delete on public.moderation_actions from anon, authenticated;

-- Verified profile facts carry a trust tier (claimed / email / vouched) that is
-- authority-like state: it is written only by server actions holding the service
-- role and by the vouch definer functions (20261008130000). Vouches and the
-- mailed-link requests are written only by those paths too. RLS already denies
-- the writes, but a denied UPDATE matches zero rows in silence, so keep the
-- refusal loud here as in production.
revoke insert, update, delete on public.profile_facts from anon, authenticated;
revoke insert, update, delete on public.fact_vouches from anon, authenticated;
revoke all on public.fact_verification_requests from anon, authenticated;
-- Signals are append-only for their owner (no UPDATE grant in production).
revoke update on public.discovery_signals from anon, authenticated;

-- SELECT everywhere EXCEPT tables with explicit column allowlists.
--
-- SB-01 (20260710120000_lock_sensitive_profile_columns.sql) dropped the
-- table-level SELECT grant on profiles and replaced it with an explicit column
-- allowlist, so that `calendar_token` — the bearer credential for the private
-- calendar feed — and the contact columns behind the `contact_public` opt-out
-- are not readable through the API by every signed-in user. A blanket
-- `grant select on all tables` here restores precisely the grant that fix
-- removed, and a table-level privilege covers every column, so the allowlist
-- stops meaning anything.
--
-- That is what this file used to do, and the cost was not theoretical:
--
--   * The pgTAP tests that exist to prove SB-01 holds could not have failed.
--     They ran against a database where the withheld columns were readable.
--   * A profiles column added without joining the allowlist read fine locally
--     and failed with 42501 in production — for the whole query, so the app saw
--     an empty profile rather than a denied column. `appearance_theme` shipped
--     that way (Settings appeared to ignore the theme you picked) and so did
--     `legal_terms_version` (the proxy stopped funnelling half-registered
--     accounts into onboarding). Neither could have been caught by any test on
--     this stack.
--
-- Granting SELECT table by table rather than revoking it afterwards is
-- deliberate: `REVOKE SELECT ON <table>` also drops the column-level SELECT
-- grants on that table, so "blanket grant, then revoke on profiles" would leave
-- a protected table unreadable in a way production is not.
--
-- `calendar_subscriptions` follows the same pattern: `ics_url` is a bearer
-- credential, so 20260829140000_calendar_subscriptions.sql revokes the hosted
-- table-wide default and grants back only the safe status columns. Keep both
-- column-allowlist carve-outs here. `parental_approvals.token` is the guardian
-- approval capability, so 20260903050000_parental_approval_token_column.sql
-- likewise replaces table-wide SELECT with a safe column allowlist.
-- `sms_opt_outs` is omitted altogether: its phone suppressions are never
-- browser-readable.
do $$
declare
  relation record;
begin
  for relation in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm', 'f')
       and c.relname not in (
         'profiles',
         'calendar_subscriptions',
         'parental_approvals',
         'sms_opt_outs',
         'sms_jobs',
         'sms_consent_events'
       )
  loop
    execute format(
      'grant select on public.%I to anon, authenticated', relation.relname
    );
  end loop;
end $$;

-- service_role mirrors the hosted default (full table access, RLS-exempt).
-- SB-01 revoked from `anon, authenticated` only, so profiles is included here.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Preserve SMS evidence and consent mutation grants when simulating hosted defaults.
revoke all on public.sms_jobs, public.sms_consent_events from anon, authenticated;
revoke insert, update, delete on public.sms_preferences from anon, authenticated;

revoke all on public.notification_email_jobs,public.guest_sms_consents,public.sms_inbound_receipts from anon,authenticated;
-- The ritual reminder ledger is written and read only by definer code
-- (20260930081000_ritual_reminders.sql).
revoke all on public.ritual_reminders from anon, authenticated;
revoke all on public.notification_routes from anon,authenticated;
grant select on public.notification_routes to authenticated;
