-- Prompt 9 (interop): a personal, revocable calendar subscription token.
-- Each profile gets an unguessable token; the /api/calendar/<token> feed emits
-- the user's upcoming plans as an iCalendar subscription that any calendar app
-- can follow. Regenerating the token (revoke) is a simple update of this column.
alter table public.profiles
  add column if not exists calendar_token uuid not null default gen_random_uuid();

create unique index if not exists profiles_calendar_token_idx
  on public.profiles (calendar_token);
