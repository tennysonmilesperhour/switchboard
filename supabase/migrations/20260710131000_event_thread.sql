-- SB-14  Event thread: RSVP-gated commentary.
--
-- Guests who've RSVP'd (accepted their invite) — plus the host and co-hosts —
-- can read the whole thread and post to it. Everyone else who can see the event
-- gets only a short preview (the opening messages) that blurs out as it goes
-- down, so there's a gentle "join to see the rest" gate rather than a hard wall.
--
-- The blur is a UX affordance; the real boundary is here in RLS. A non-RSVP'd
-- viewer's client is never sent the gated rows — the server fetches only the
-- preview slice for them, and this SELECT policy refuses the rest either way.

-- ————————————————————————— access helper —————————————————————————
-- Full thread access: the host / co-hosts, or an invitee who has accepted.
-- (Preview access is a strict superset handled in the app via can_view_event;
-- it grants no direct row access, so it stays out of RLS.)
create or replace function public.can_access_event_thread(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_event_host(p_event, p_user) or exists (
    select 1 from public.invites i
    where i.event_id = p_event
      and i.invitee_id = p_user
      and i.status = 'accepted'
  );
$$;

-- ————————————————————————— thread —————————————————————————
create table public.event_comments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index event_comments_event_idx on public.event_comments (event_id, created_at);

alter table public.event_comments enable row level security;

-- Read the full thread only with thread access. Preview rows for non-RSVP'd
-- viewers are served through the service-role client with an app-side slice.
create policy event_comments_select on public.event_comments for select to authenticated
  using (public.can_access_event_thread(event_id, auth.uid()));

-- Post only if you have thread access, and only as yourself.
create policy event_comments_insert on public.event_comments for insert to authenticated
  with check (
    author_id = auth.uid()
    and public.can_access_event_thread(event_id, auth.uid())
  );

-- Tidy up: your own comment, or the host/co-host moderating the thread.
create policy event_comments_delete on public.event_comments for delete to authenticated
  using (author_id = auth.uid() or public.is_event_host(event_id, auth.uid()));

alter publication supabase_realtime add table public.event_comments;
