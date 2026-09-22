-- Moving somebody between waves while the invitations are already in motion.
--
-- `move_queued_invite` (20260711130000) covers the one-at-a-time line: swap two
-- queued invites and the next person asked changes. A wave plan has no such
-- line — a whole stage goes out together — so the equivalent edit is "which
-- wave is this person in", and there was no way to make it. The wave was set in
-- the wizard and frozen from then on, while the plan page offered "edit it while
-- live: reorder, resend, change response windows". A client walking the scope
-- checklist reported exactly that gap: "Unable to reorder people in the queue."
--
-- Built to the same rules as its sibling `set_invite_window`:
--
--   * host or co-host only (`private.is_event_host` covers both);
--   * **queued invites only**, and the status guard lives in the UPDATE's WHERE
--     clause so it is atomic — if the cascade sweep sent this invite a moment
--     ago, zero rows change and we say so rather than rewriting history that has
--     already reached somebody;
--   * no advisory lock, unlike `move_queued_invite`: that one needs a temporary
--     out-of-range `position` to dodge a unique constraint mid-swap, and this is
--     a single-row update of a column with no uniqueness to collide on.
--
-- Range: an existing wave, or the one immediately after the last, capped at five
-- waves total (stages 0-4) to match what the wizard offers. That deliberately
-- allows moving someone INTO a wave that has already gone out — the cascade
-- engine walks stages in order and sends anyone queued in an already-sent stage
-- on its next sweep, which is precisely "ask them sooner". It does not allow
-- skipping ahead to wave 5 of a two-wave plan, which would leave a gap the
-- engine reads as a resolved stage.
create or replace function public.set_invite_stage(p_invite uuid, p_stage int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid;
  v_max_stage int;
  v_updated int;
begin
  if p_stage is null or p_stage < 0 or p_stage > 4 then
    raise exception 'wave must be between 1 and 5';
  end if;

  select event_id into v_event from public.invites where id = p_invite;
  if v_event is null then raise exception 'invite not found'; end if;
  if not private.is_event_host(v_event, auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- An existing wave, or one past the last. `coalesce` is belt and braces: the
  -- invite read above proves at least one row exists for this event.
  select max(group_stage) into v_max_stage
    from public.invites where event_id = v_event;
  if p_stage > least(coalesce(v_max_stage, 0) + 1, 4) then
    raise exception 'that wave does not exist yet';
  end if;

  update public.invites set group_stage = p_stage
    where id = p_invite and status = 'queued';
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'only invites that have not gone out can change wave';
  end if;
end $$;

-- Same grant shape as the rest of the cascade-editing surface: reachable by a
-- signed-in host through the Data API, never by an anonymous caller.
revoke all on function public.set_invite_stage(uuid, int) from public, anon;
grant execute on function public.set_invite_stage(uuid, int) to authenticated;
