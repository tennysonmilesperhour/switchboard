-- Final release cleanup for advisor findings that were outside the original
-- function allowlist. Trigger functions are not client RPCs, and cascade-edit
-- RPCs must require a signed-in host.

alter function public.freeze_connection_parties() set search_path = '';
alter function public.freeze_event_host() set search_path = '';
alter function public.freeze_ritual_parties() set search_path = '';
alter function public.freeze_board_owner() set search_path = '';

revoke all on function public.freeze_connection_parties() from public, anon, authenticated;
revoke all on function public.freeze_event_host() from public, anon, authenticated;
revoke all on function public.freeze_ritual_parties() from public, anon, authenticated;
revoke all on function public.freeze_board_owner() from public, anon, authenticated;

alter function public.move_queued_invite(uuid, boolean) set search_path = '';
alter function public.set_invite_window(uuid, integer) set search_path = '';

revoke all on function public.move_queued_invite(uuid, boolean) from public, anon;
revoke all on function public.set_invite_window(uuid, integer) from public, anon;
grant execute on function public.move_queued_invite(uuid, boolean) to authenticated;
grant execute on function public.set_invite_window(uuid, integer) to authenticated;

-- sync_profile_contacts is invoked only by its table trigger. Direct RPC access
-- would run with definer privileges and serves no product use case.
revoke all on function public.sync_profile_contacts() from public, anon, authenticated;

-- Public buckets are readable by their object URLs without a SELECT policy.
-- Removing these broad policies prevents clients from listing every object;
-- uploads are mediated by authenticated server routes using the service role.
drop policy if exists "media public read" on storage.objects;
drop policy if exists "profile media public read" on storage.objects;

create or replace function public.app_schema_version()
returns text
language sql
stable
set search_path = ''
as $$
  select '20260717071754'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
