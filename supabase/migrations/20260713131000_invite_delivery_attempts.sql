-- Durable, host-visible evidence of each invitation channel attempt. The
-- invitation itself may remain active even when an off-platform provider is
-- unavailable; this table prevents the UI from confusing "invited" with
-- "message delivered".

create table public.invite_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  channel text not null check (channel in ('in_app', 'email', 'sms')),
  status text not null check (
    status in ('sent', 'not_configured', 'invalid_recipient', 'failed')
  ),
  provider text not null,
  provider_message_id text,
  error_code text,
  attempted_at timestamptz not null default now()
);

create index invite_delivery_attempts_invite_time_idx
  on public.invite_delivery_attempts (invite_id, attempted_at desc);

alter table public.invite_delivery_attempts enable row level security;

create policy invite_delivery_attempts_manager_select
on public.invite_delivery_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.invites i
    join public.events e on e.id = i.event_id
    where i.id = invite_id
      and (
        e.host_id = auth.uid()
        or exists (
          select 1 from public.event_cohosts c
          where c.event_id = e.id and c.cohost_id = auth.uid()
        )
      )
  )
);

revoke insert, update, delete on public.invite_delivery_attempts from anon, authenticated;
grant select on public.invite_delivery_attempts to authenticated;
