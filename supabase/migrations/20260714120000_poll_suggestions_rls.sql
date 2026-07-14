-- M6: enforce the `allow_suggestions` gate at the database layer, not just in
-- the server action. Previously poll_options_insert only required
-- can_view_event, so any invitee could add an option even when the host had
-- turned suggestions off. Now a non-host may insert an option only when the
-- poll still allows suggestions; the host or a co-host may always add options.

drop policy if exists poll_options_insert on public.poll_options;

create policy poll_options_insert on public.poll_options for insert to authenticated
  with check (
    public.can_view_event(
      (select event_id from public.polls p where p.id = poll_id),
      auth.uid()
    )
    and (
      public.is_event_host(
        (select event_id from public.polls p where p.id = poll_id),
        auth.uid()
      )
      or coalesce(
        (select allow_suggestions from public.polls p where p.id = poll_id),
        false
      )
    )
  );
