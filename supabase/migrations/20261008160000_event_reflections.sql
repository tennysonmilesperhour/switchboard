-- Reflection deck: one private verdict per person per finished plan.
--
-- A swipe on a past plan records how it went (loved / liked / disliked / didn't
-- go), optionally with a few preset detail tags and a journal entry. Strictly
-- private, like energy_logs: the only reader is the person who wrote it.
-- Whether the plan is "over" is decided in the app (a day past its start, or
-- marked happened/past), not here, so a host can still reflect on a plan they
-- ended early.

create table public.event_reflections (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  verdict text not null check (verdict in ('loved', 'liked', 'disliked', 'missed')),
  tags text[] not null default '{}' check (cardinality(tags) <= 12),
  journal text check (journal is null or char_length(journal) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create index event_reflections_event_idx on public.event_reflections (event_id);

alter table public.event_reflections enable row level security;

create policy event_reflections_select on public.event_reflections
  for select to authenticated
  using (user_id = (select auth.uid()));

-- Insert is limited to plans the caller can already see, so a row cannot probe
-- for plans that are hidden from them.
create policy event_reflections_insert on public.event_reflections
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.events e where e.id = event_id)
  );

create policy event_reflections_update on public.event_reflections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy event_reflections_delete on public.event_reflections
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Ownership columns are frozen: an update can change the answer, never whose
-- it is or which plan it is about.
create or replace function private.freeze_event_reflection_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.event_id is distinct from old.event_id then
    raise exception 'event_reflections keys are immutable';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger event_reflections_freeze_keys
  before update on public.event_reflections
  for each row execute function private.freeze_event_reflection_keys();

revoke all on function private.freeze_event_reflection_keys() from public, anon, authenticated;
grant execute on function private.freeze_event_reflection_keys() to service_role;
