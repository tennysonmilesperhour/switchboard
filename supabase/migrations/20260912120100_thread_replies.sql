-- Replies in a plan's thread.
--
-- Client feedback: "I found myself wishing I could reply directly to this
-- message, but couldn't." A comment may now point at the comment it answers,
-- so the page can quote it and the person who wrote it can be told.
--
-- The parent must be on the same plan. RLS cannot express that (it sees one
-- row at a time), so a BEFORE INSERT/UPDATE trigger refuses a cross-plan
-- pointer; without it a reply could quote a comment from a plan its author
-- cannot read, via the preview that the page renders for the parent.

alter table public.event_comments
  add column if not exists reply_to_id uuid references public.event_comments(id) on delete set null;

create index if not exists event_comments_reply_idx
  on public.event_comments (reply_to_id)
  where reply_to_id is not null;

create or replace function public.check_event_comment_reply()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reply_to_id is null then
    return new;
  end if;
  if new.reply_to_id = new.id then
    raise exception 'a comment cannot reply to itself';
  end if;
  if not exists (
    select 1 from public.event_comments parent
    where parent.id = new.reply_to_id
      and parent.event_id = new.event_id
  ) then
    raise exception 'a reply must answer a comment on the same plan';
  end if;
  return new;
end
$$;

revoke all on function public.check_event_comment_reply() from public, anon, authenticated;

drop trigger if exists event_comments_check_reply on public.event_comments;
create trigger event_comments_check_reply
  before insert or update of reply_to_id on public.event_comments
  for each row execute function public.check_event_comment_reply();
