-- Switchboard's SMS terms promise that replying STOP prevents every future
-- send. Keep that suppression in our own database as well as Twilio's block
-- list so application code can fail closed before it calls the provider.

create table public.sms_opt_outs (
  normalized_number text primary key,
  opted_out_at timestamptz not null default now(),
  constraint sms_opt_outs_normalized_number_check check (
    public.normalize_phone_number(normalized_number) = normalized_number
  )
);

comment on table public.sms_opt_outs is
  'Phone numbers that replied with a Twilio opt-out keyword; service-role only.';

alter table public.sms_opt_outs enable row level security;
alter table public.sms_opt_outs force row level security;

-- There are deliberately no browser policies. The signed Twilio webhook and
-- the server-side send guard are the only readers/writers.
revoke all on table public.sms_opt_outs from anon, authenticated;
grant select, insert, update, delete on table public.sms_opt_outs to service_role;

-- An invitation suppressed by this table is a distinct, operator-actionable
-- delivery outcome rather than a provider failure.
alter table public.invite_delivery_attempts
  drop constraint invite_delivery_attempts_status_check;
alter table public.invite_delivery_attempts
  add constraint invite_delivery_attempts_status_check check (
    status in ('sent', 'not_configured', 'invalid_recipient', 'opted_out', 'failed')
  );
