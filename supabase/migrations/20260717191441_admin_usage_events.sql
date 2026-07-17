-- Internal operator ledger for API usage, delivery usage, product events, and
-- operational failures. This is intentionally service-role only: normal users
-- should never read aggregate operational metadata through the Data API.

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  area text not null check (
    area in ('ai', 'email', 'sms', 'notification', 'product', 'error')
  ),
  source text not null,
  feature text not null,
  status text not null check (
    status in (
      'success',
      'fallback',
      'sent',
      'not_configured',
      'invalid_recipient',
      'failed',
      'skipped',
      'error'
    )
  ),
  route text,
  entity_type text,
  entity_id uuid,
  provider text,
  provider_message_id text,
  model text,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  cost_micros bigint not null default 0 check (cost_micros >= 0),
  error_code text,
  metadata jsonb not null default '{}'::jsonb
);

create index usage_events_created_at_idx
  on public.usage_events (created_at desc);

create index usage_events_area_feature_time_idx
  on public.usage_events (area, feature, created_at desc);

create index usage_events_source_time_idx
  on public.usage_events (source, created_at desc);

create index usage_events_status_time_idx
  on public.usage_events (status, created_at desc);

create index usage_events_user_time_idx
  on public.usage_events (user_id, created_at desc)
  where user_id is not null;

alter table public.usage_events enable row level security;

revoke all on table public.usage_events from public, anon, authenticated;
grant select, insert on table public.usage_events to service_role;

create or replace function public.app_schema_version()
returns text
language sql
stable
set search_path = public
as $$
  select '20260717191441'::text;
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
