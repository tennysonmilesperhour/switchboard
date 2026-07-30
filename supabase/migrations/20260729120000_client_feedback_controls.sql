-- Client-feedback controls: authors may correct board announcements without
-- gaining the ability to move or reclassify them.

alter table public.board_posts
  add column if not exists updated_at timestamptz;

create or replace function public.freeze_board_post_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id
     or new.board_id is distinct from old.board_id
     or new.kind is distinct from old.kind then
    raise exception 'board post identity is immutable';
  end if;
  return new;
end
$$;

drop trigger if exists board_posts_freeze_identity on public.board_posts;
create trigger board_posts_freeze_identity
  before update on public.board_posts
  for each row execute function public.freeze_board_post_identity();

drop policy if exists board_posts_update on public.board_posts;
create policy board_posts_update on public.board_posts
  for update to authenticated
  using (
    author_id = (select auth.uid())
    and public.is_board_member(board_id, (select auth.uid()))
  )
  with check (
    author_id = (select auth.uid())
    and public.is_board_member(board_id, (select auth.uid()))
  );

revoke all on function public.freeze_board_post_identity() from public, anon, authenticated;

create or replace function public.app_schema_version()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select '20260729120000'::text
$$;

revoke all on function public.app_schema_version() from public, anon, authenticated;
grant execute on function public.app_schema_version() to service_role;
