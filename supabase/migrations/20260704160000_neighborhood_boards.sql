-- Neighborhood Boards: permanent, invite-only local boards with recurring
-- open events and neighbor notices. A standalone system, separate from
-- Serendipity Zones.

create table public.boards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,40}$'),
  name text not null,
  description text,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.board_members (
  board_id uuid not null references public.boards(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'moderator')),
  joined_at timestamptz not null default now(),
  primary key (board_id, member_id)
);

create table public.board_posts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'notice' check (kind in ('notice', 'event')),
  title text not null check (char_length(title) between 1 and 120),
  body text,
  location text,
  cadence text, -- e.g. "Every Saturday, 9am" for a recurring open event
  starts_at timestamptz,
  created_at timestamptz not null default now()
);
create index board_posts_board_idx on public.board_posts (board_id, created_at desc);

-- ————————————————————————— membership helpers —————————————————————————
create or replace function public.is_board_member(p_board uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.board_members
    where board_id = p_board and member_id = p_user
  );
$$;

create or replace function public.is_board_moderator(p_board uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.board_members
    where board_id = p_board and member_id = p_user and role = 'moderator'
  );
$$;

alter table public.boards enable row level security;
alter table public.board_members enable row level security;
alter table public.board_posts enable row level security;

-- boards: only members can see a board (invite-only). Creation flows through
-- create_board() below, so there is no direct insert policy. Moderators edit.
create policy boards_select on public.boards for select to authenticated
  using (public.is_board_member(id, auth.uid()));
create policy boards_update on public.boards for update to authenticated
  using (public.is_board_moderator(id, auth.uid()));
create policy boards_delete on public.boards for delete to authenticated
  using (created_by = auth.uid());

-- board_members: members see the roster; moderators invite; you can always
-- leave, and moderators can remove.
create policy board_members_select on public.board_members for select to authenticated
  using (public.is_board_member(board_id, auth.uid()));
create policy board_members_insert on public.board_members for insert to authenticated
  with check (public.is_board_moderator(board_id, auth.uid()));
create policy board_members_delete on public.board_members for delete to authenticated
  using (member_id = auth.uid() or public.is_board_moderator(board_id, auth.uid()));

-- board_posts: members read and post; author or a moderator can remove.
create policy board_posts_select on public.board_posts for select to authenticated
  using (public.is_board_member(board_id, auth.uid()));
create policy board_posts_insert on public.board_posts for insert to authenticated
  with check (author_id = auth.uid() and public.is_board_member(board_id, auth.uid()));
create policy board_posts_delete on public.board_posts for delete to authenticated
  using (author_id = auth.uid() or public.is_board_moderator(board_id, auth.uid()));

-- Atomic board creation: insert the board and enroll the creator as its first
-- moderator in one shot (side-steps the members-insert chicken-and-egg).
create or replace function public.create_board(
  p_name text,
  p_slug text,
  p_description text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into public.boards (slug, name, description, created_by)
    values (p_slug, p_name, nullif(btrim(p_description), ''), auth.uid())
    returning id into v_id;
  insert into public.board_members (board_id, member_id, role)
    values (v_id, auth.uid(), 'moderator');
  return p_slug;
end $$;
