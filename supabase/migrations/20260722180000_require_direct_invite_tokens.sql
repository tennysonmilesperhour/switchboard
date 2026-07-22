-- Every direct invitation must have a capability URL that works independently
-- of browser session and account state. Application code sends /rsvp/<token>
-- for members and off-platform guests alike; enforce the invariant here so a
-- future insert cannot silently fall back to an RLS-gated /events/<id> link.

update public.invites
   set guest_token = gen_random_uuid()
 where guest_token is null;

alter table public.invites
  alter column guest_token set not null;
