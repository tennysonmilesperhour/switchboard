-- Cleanup: hot-path indexes, a missing uniqueness guard, and a message-delete
-- policy so redaction is possible.

-- SB-22  Missing indexes on columns filtered/joined on every discovery, feed,
--        and contact-match call. Fine at small scale, sequential scans as the
--        graph grows.
create index if not exists connections_addressee_idx
  on public.connections (addressee_id);
create index if not exists connections_accepted_idx
  on public.connections (status) where status = 'accepted';
create index if not exists profiles_contact_email_lower_idx
  on public.profiles (lower(contact_email));
create index if not exists room_members_member_idx
  on public.room_members (member_id);

-- SB-23  No uniqueness on matches, so a race or re-fire could create duplicate
--        (user_a, user_b, activity, kind) rows and duplicate rooms. Dedupe any
--        existing duplicates (keep the earliest ctid) before adding the guard.
delete from public.matches m
  using public.matches keep
  where m.user_a = keep.user_a
    and m.user_b = keep.user_b
    and m.activity = keep.activity
    and m.kind = keep.kind
    and m.ctid > keep.ctid;
create unique index if not exists matches_unique_pairing
  on public.matches (user_a, user_b, activity, kind);

-- SB-27  messages had select+insert policies only, so not even the sender could
--        delete their own message — moderation/redaction was impossible without
--        the service role. Allow authors to delete their own messages.
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = auth.uid());
