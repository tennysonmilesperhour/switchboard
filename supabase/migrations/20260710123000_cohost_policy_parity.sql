-- SB-13  Co-hosts are documented as sharing host powers, and is_event_host()
--        already covers both primary host and co-hosts — but it was wired into
--        only a few policies (announcements, polls_update). The remaining
--        host-gated policies still tested `host_id = auth.uid()`, so a co-host
--        silently could not edit the event, manage its invites, create polls,
--        or manage RSVP questions. Route them all through is_event_host for
--        parity. (poll_options / event_questions SELECT and poll_options INSERT
--        are intentionally viewer-scoped for guest suggestions and are left
--        alone.)

drop policy if exists events_update on public.events;
create policy events_update on public.events for update to authenticated
  using (public.is_event_host(id, auth.uid()));

drop policy if exists invites_insert on public.invites;
create policy invites_insert on public.invites for insert to authenticated
  with check (public.is_event_host(event_id, auth.uid()));

drop policy if exists invites_delete on public.invites;
create policy invites_delete on public.invites for delete to authenticated
  using (public.is_event_host(event_id, auth.uid()));

drop policy if exists polls_insert on public.polls;
create policy polls_insert on public.polls for insert to authenticated
  with check (public.is_event_host(event_id, auth.uid()));

drop policy if exists event_questions_write on public.event_questions;
create policy event_questions_write on public.event_questions for insert to authenticated
  with check (public.is_event_host(event_id, auth.uid()));

drop policy if exists event_questions_update on public.event_questions;
create policy event_questions_update on public.event_questions for update to authenticated
  using (public.is_event_host(event_id, auth.uid()));

drop policy if exists event_questions_delete on public.event_questions;
create policy event_questions_delete on public.event_questions for delete to authenticated
  using (public.is_event_host(event_id, auth.uid()));
