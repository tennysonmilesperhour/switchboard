-- Switchboard: table-stakes hosting features, in the Switchboard idiom.
--   - off-platform (email) delivery bookkeeping
--   - automatic event reminders (tracked so they fire once)
--   - host announcements (a calm "text blast" that lands in the Living Room)
--   - per-guest RSVP questions with host-only answers
--   - cover image, theme, wishlist link
-- Anonymity invariants from 0001 are preserved: answers are visible only to
-- the event host and the answering guest, never to other guests.

-- ————————————————————————— events: new columns —————————————————————————
alter table public.events add column cover_url text;
alter table public.events add column theme text not null default 'default'
  check (theme in ('default', 'sunrise', 'dusk', 'meadow', 'ink', 'blossom'));
alter table public.events add column wishlist_url text;
alter table public.events add column reminders_enabled boolean not null default true;
-- One-shot markers so a reminder is sent at most once per window.
alter table public.events add column reminded_day_before_at timestamptz;
alter table public.events add column reminded_soon_at timestamptz;

-- ————————————————————————— host announcements —————————————————————————
-- A host broadcast to everyone who's in: door code, running late, bring a
-- jacket. Readable by anyone who can see the event; only the host writes.
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index announcements_event_idx on public.announcements (event_id, created_at desc);

alter table public.announcements enable row level security;
create policy announcements_select on public.announcements for select to authenticated
  using (public.can_view_event(event_id, auth.uid()));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (
    author_id = auth.uid()
    and exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid())
  );
create policy announcements_delete on public.announcements for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- ————————————————————————— RSVP questions —————————————————————————
-- Host-defined intake questions (dietary needs, what are you bringing, …).
-- Questions follow event visibility; answers are host-or-author only.
create table public.event_questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  prompt text not null check (char_length(prompt) between 1 and 200),
  required boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index event_questions_event_idx on public.event_questions (event_id, position);

create table public.invite_answers (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null references public.invites(id) on delete cascade,
  question_id uuid not null references public.event_questions(id) on delete cascade,
  answer text not null check (char_length(answer) between 1 and 2000),
  created_at timestamptz not null default now(),
  unique (invite_id, question_id)
);
create index invite_answers_invite_idx on public.invite_answers (invite_id);

alter table public.event_questions enable row level security;
alter table public.invite_answers enable row level security;

create policy event_questions_select on public.event_questions for select to authenticated
  using (public.can_view_event(event_id, auth.uid()));
create policy event_questions_write on public.event_questions for insert to authenticated
  with check (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
create policy event_questions_update on public.event_questions for update to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));
create policy event_questions_delete on public.event_questions for delete to authenticated
  using (exists (select 1 from public.events e where e.id = event_id and e.host_id = auth.uid()));

-- Answers: the host of the event sees all; a registered invitee sees and
-- writes their own. Guest answers arrive through the service role (RLS off).
create policy invite_answers_select on public.invite_answers for select to authenticated
  using (
    exists (
      select 1 from public.invites i
      join public.events e on e.id = i.event_id
      where i.id = invite_id and (e.host_id = auth.uid() or i.invitee_id = auth.uid())
    )
  );
create policy invite_answers_insert on public.invite_answers for insert to authenticated
  with check (
    exists (select 1 from public.invites i where i.id = invite_id and i.invitee_id = auth.uid())
  );
create policy invite_answers_update on public.invite_answers for update to authenticated
  using (
    exists (select 1 from public.invites i where i.id = invite_id and i.invitee_id = auth.uid())
  );

alter publication supabase_realtime add table public.announcements;
