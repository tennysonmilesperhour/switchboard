-- Poll ideas people can correct, enrich, and withdraw.
--
-- Client feedback: an idea typed as "Geek festival" instead of "Greek festival"
-- could not be fixed or removed, and the only way to attach a link was to paste
-- it into the name. An idea now remembers who suggested it, may carry a link, a
-- photo, and (already) a description, and its author or the plan's host may
-- edit or remove it while the poll is still open.
--
-- Security notes (docs/SECURITY.md):
--   * `author_id` is stamped from auth.uid() and frozen with a trigger, so a
--     row can never be re-attributed. Existing rows have no author; only the
--     host may edit those.
--   * UPDATE carries an explicit WITH CHECK. RLS cannot compare OLD and NEW,
--     which is what the freeze trigger is for.
--   * A decided poll is closed to edits at the database, not just the UI: the
--     winning idea is the plan now, and its wording is the record.
--   * `image_url` is validated app-side to be one of our own public storage
--     URLs; `link_url` must be an http(s) address. Both are bounded so a row cannot be used
--     as a blob store.

alter table public.poll_options
  add column if not exists author_id uuid references public.profiles(id) on delete set null,
  add column if not exists link_url text,
  add column if not exists image_url text,
  add column if not exists updated_at timestamptz;

alter table public.poll_options
  alter column author_id set default auth.uid();

alter table public.poll_options
  drop constraint if exists poll_options_link_url_shape;
alter table public.poll_options
  add constraint poll_options_link_url_shape
  check (link_url is null or (link_url ~ '^https?://' and char_length(link_url) <= 2048));

alter table public.poll_options
  drop constraint if exists poll_options_image_url_shape;
alter table public.poll_options
  add constraint poll_options_image_url_shape
  check (image_url is null or (image_url ~ '^https://' and char_length(image_url) <= 2048));

-- ————————————————————————— who may change what ——————————————————————————
create or replace function private.can_edit_poll_option(p_option uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and exists (
    select 1
    from public.poll_options o
    join public.polls p on p.id = o.poll_id
    where o.id = p_option
      and p.phase <> 'decided'
      and (
        o.author_id = p_user
        or private.is_event_host(p.event_id, p_user)
      )
  );
$$;

revoke all on function private.can_edit_poll_option(uuid, uuid)
  from public, anon;
grant execute on function private.can_edit_poll_option(uuid, uuid)
  to authenticated, service_role;

-- Inserts keep their viewer/suggestions gate and must be attributed to the
-- caller. `author_id` defaults to auth.uid(), so a client that omits it still
-- passes; one that names someone else does not.
drop policy if exists poll_options_insert on public.poll_options;
create policy poll_options_insert on public.poll_options for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and private.can_view_event(
      (select event_id from public.polls p where p.id = poll_id),
      (select auth.uid())
    )
    and (
      private.is_event_host(
        (select event_id from public.polls p where p.id = poll_id),
        (select auth.uid())
      )
      or coalesce(
        (select allow_suggestions from public.polls p where p.id = poll_id),
        false
      )
    )
  );

drop policy if exists poll_options_update on public.poll_options;
create policy poll_options_update on public.poll_options for update to authenticated
  using (private.can_edit_poll_option(id, (select auth.uid())))
  with check (private.can_edit_poll_option(id, (select auth.uid())));

drop policy if exists poll_options_delete on public.poll_options;
create policy poll_options_delete on public.poll_options for delete to authenticated
  using (private.can_edit_poll_option(id, (select auth.uid())));

-- ————————————————————————— identity is immutable ————————————————————————
create or replace function public.freeze_poll_option_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.poll_id is distinct from old.poll_id
     or new.author_id is distinct from old.author_id
     or new.source is distinct from old.source then
    raise exception 'poll option identity is immutable';
  end if;
  return new;
end
$$;

revoke all on function public.freeze_poll_option_identity() from public, anon, authenticated;

drop trigger if exists poll_options_freeze_identity on public.poll_options;
create trigger poll_options_freeze_identity
  before update on public.poll_options
  for each row execute function public.freeze_poll_option_identity();
