-- Give Space: the heads-up becomes a fact recorded at the moment you commit,
-- not a live read of where somebody else is.
--
-- Client feedback, in her words: "Give Space should help me change my behavior
-- without giving me information about yours." The shipped heads-up did the
-- opposite of that in five ways at once. It named the person, said they were
-- going, recomputed on every page view, disappeared the moment they dropped
-- out, and cost nothing to ask — so anyone could open plan after plan and read
-- another person's week off the answers.
--
-- What replaces it is one boolean per (viewer, plan), written once:
--
--   * **Only in response to the viewer's own action.** `note_give_space_overlap`
--     refuses unless the caller holds an ACCEPTED invite to the plan. Viewing
--     is not an action; RSVPing is. There is no path that evaluates this
--     because a page was opened.
--   * **Only one bit.** The function returns a boolean and the table stores a
--     boolean. No id, no name, no count, no status, no time. Five people on the
--     list and five of them going is the same stored value as one.
--   * **Frozen once true.** A row that says `warned` stays saying it for as
--     long as the plan exists. "They're no longer expected there" is nearly as
--     revealing as "they're going", so the notice never withdraws itself and
--     never updates — what it records is what was true when she chose to go.
--   * **Monotonic.** Re-accepting an invitation re-evaluates, so someone who
--     changes their answer gets a current reading; the evaluation may only ever
--     turn the bit ON. It cannot be driven back to false to probe a departure.
--   * **Costly to ask.** One reading per accepted invitation. Probing means
--     actually RSVPing yes to a plan, in front of its host, with the cascade
--     and the notification that follows — which is the rate limit.
--
-- This sits inside the Give Space safety invariant in docs/SECURITY.md rather
-- than beside it: the avoid list stays owner-only, nothing is filtered or
-- removed, no notification is generated, and no location surface is touched.

create table if not exists public.give_space_notices (
  user_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  -- The whole payload. True means "at least one person you give space to was
  -- expected here when you said you were coming" and nothing more.
  warned boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

alter table public.give_space_notices enable row level security;

-- Readable only by its owner, and writable by nobody through RLS: the definer
-- function below is the only thing that may decide this value. A self-writable
-- row would let someone set their own `warned` to false and then re-run the
-- evaluation, which is the departure probe this design exists to refuse.
drop policy if exists give_space_notices_own on public.give_space_notices;
create policy give_space_notices_own on public.give_space_notices
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.give_space_notices from authenticated, anon;
grant select on public.give_space_notices to authenticated;

/**
 * Decide, once, whether this person's commitment to this plan overlaps with
 * someone they've asked for space from.
 *
 * SECURITY DEFINER because it has to read the plan's accepted invitees — which
 * the caller may not be allowed to see — in order to answer a question that
 * deliberately tells them nothing about who those invitees are. The caller is
 * re-authorized against the exact resource on the first line — no accepted
 * invite, no answer — so the subject can only ever be someone who has already
 * said yes to this plan themselves.
 *
 * `p_user` is why this is not reachable from a session: an authenticated role
 * gets the `auth.uid()`-bound wrapper below and nothing else, so nobody can
 * point the question at another account. The parameter exists for the one case
 * that has no session to read — the host approving an Open Table request,
 * where the commitment was made earlier by the person being approved.
 */
create or replace function private.decide_give_space_notice(
  p_user uuid,
  p_event uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_user;
  v_committed boolean;
  v_existing boolean;
  v_overlap boolean;
begin
  if v_user is null or p_event is null then
    return false;
  end if;

  -- The commitment gate. Nothing below runs for someone who merely opened the
  -- plan, was invited to it, asked to join it, or used to be going.
  select exists (
    select 1
    from public.invites i
    where i.event_id = p_event
      and i.invitee_id = v_user
      and i.status = 'accepted'
  )
  into v_committed;
  if not v_committed then
    return false;
  end if;

  -- Already warned: hand back the frozen answer without looking at anybody's
  -- current whereabouts. This is the branch that makes a departure unobservable.
  select n.warned into v_existing
  from public.give_space_notices n
  where n.user_id = v_user and n.event_id = p_event;
  if v_existing then
    return true;
  end if;

  select exists (
    select 1
    from public.invites i
    join public.profile_avoids a
      on a.avoided_id = i.invitee_id
    where i.event_id = p_event
      and i.status = 'accepted'
      and a.avoider_id = v_user
      and i.invitee_id <> v_user
  )
  into v_overlap;

  insert into public.give_space_notices (user_id, event_id, warned)
  values (v_user, p_event, v_overlap)
  on conflict (user_id, event_id) do update
    -- Monotonic: a later evaluation may raise the bit, never lower it.
    set warned = public.give_space_notices.warned or excluded.warned;

  return v_overlap;
end;
$$;

revoke all on function private.decide_give_space_notice(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.decide_give_space_notice(uuid, uuid) to service_role;

/**
 * The thin invoker wrapper the app calls, bound to the caller.
 *
 * The only thing an `authenticated` role may execute, and it substitutes
 * `auth.uid()` here rather than taking it from the caller — so the question can
 * only ever be asked about oneself.
 */
create or replace function public.note_give_space_overlap(p_event uuid)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select private.decide_give_space_notice(auth.uid(), p_event);
$$;

revoke all on function public.note_give_space_overlap(uuid) from public, anon;
grant execute on function public.note_give_space_overlap(uuid) to authenticated;

/**
 * The Open Table path: a request to join, made by the person themselves,
 * becomes an acceptance when the host approves it. The commitment is theirs and
 * happened earlier; there is simply no session of theirs to run it in when it
 * completes, so the host's approval carries it out on their behalf.
 *
 * Service-role only, and it still has to pass the same gate — the named user
 * must hold an accepted invite to that exact plan before anything is read or
 * written.
 */
create or replace function public.note_give_space_overlap_for(
  p_user uuid,
  p_event uuid
)
returns boolean
language sql
volatile
security definer
set search_path = ''
as $$
  select private.decide_give_space_notice(p_user, p_event);
$$;

revoke all on function public.note_give_space_overlap_for(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.note_give_space_overlap_for(uuid, uuid) to service_role;
