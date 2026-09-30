-- Sabbatical mode pauses what Settings says it pauses (completion plan P6,
-- decision D6).
--
-- The switch cleared a live signal and hid the person from radar, discovery
-- and matchmaking, and nothing else. Notifications kept buzzing, texting and
-- emailing, and Mutual kept matching. D6: a sabbatical mutes everything except
-- what a plan the person is already in says to them.
--
--   1. `private.sabbatical_allows` is that list of notification kinds, in SQL.
--      `SABBATICAL_KINDS` in src/lib/sabbatical.ts is the same list for the
--      push gate, and src/lib/sabbatical.test.ts reads this file to prove the
--      two agree. A kind not on the list is muted, so a new kind is quiet for
--      someone on sabbatical until somebody decides otherwise.
--   2. Texts and emails are held here, at the queue: a BEFORE INSERT trigger
--      on `sms_jobs` and `notification_email_jobs` drops a job whose
--      notification is muted for its recipient. The in-app row is still
--      written, so nothing is lost; it waits in the inbox without a buzz, the
--      same rule category switches and quiet hours already follow.
--   3. Mutual is paused both ways, in the `mutual_intents` write policy: an
--      active "down to connect" or discovery interest can be neither sent by
--      someone on sabbatical nor aimed at them. Withdrawing one is always
--      allowed, so a sabbatical never traps an old intent.
--
-- Invitations still arrive. A host picking someone on sabbatical sees their
-- note in the picker (the app reads it), and the invitation waits in the
-- recipient's inbox without a notification. The note itself is capped at the
-- 140 characters the Settings field allows.

-- ————————————————————————— the note —————————————————————————

-- The note is now shown to other people (on the profile and in the invite
-- pickers), so it gets the bound the Settings field always promised.
update public.profiles
   set sabbatical_message = left(sabbatical_message, 140)
 where char_length(sabbatical_message) > 140;
alter table public.profiles
  add constraint profiles_sabbatical_message_length
  check (sabbatical_message is null or char_length(sabbatical_message) <= 140);

-- ————————————————————————— what still gets through —————————————————————————

create or replace function private.sabbatical_allows(p_kind text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_kind in (
    -- A plan you are in changed, was called off, or got its date.
    'event_updated',
    'event_urgent_change',
    'event_cancelled',
    'event_date_set',
    -- What its host or its guests say to you.
    'announcement',
    'event_comment',
    'room_message',
    'rsvp_declined_note',
    -- Reminders for what you said yes to. (Not `poll_opened`: a new plan
    -- that starts as a vote uses it to ask people who are not in yet.)
    'reminder',
    -- Your own place in a plan: let in, or a guardian's answer.
    'join_approved',
    'parental_approval',
    'parental_approval_denied'
  ), false)
$$;

revoke all on function private.sabbatical_allows(text) from public, anon, authenticated;
grant execute on function private.sabbatical_allows(text) to service_role;

comment on function private.sabbatical_allows(text) is
  'Notification kinds that still reach someone on sabbatical (D6). Mirrors SABBATICAL_KINDS in src/lib/sabbatical.ts.';

-- Whether a notification of this kind is muted for this person right now.
create or replace function private.sabbatical_mutes(p_user uuid, p_kind text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = p_user
       and coalesce(p.sabbatical, false)
  ) and not private.sabbatical_allows(p_kind)
$$;

revoke all on function private.sabbatical_mutes(uuid, text) from public, anon, authenticated;
grant execute on function private.sabbatical_mutes(uuid, text) to service_role;

-- ————————————————————————— texts and emails —————————————————————————

-- A queued text or email for an account holder always points at the
-- notification it announces (guest texts carry no user and are never muted:
-- a guest has no sabbatical to be on).
create or replace function private.hold_job_for_sabbatical()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null or new.notification_id is null then
    return new;
  end if;
  if private.sabbatical_mutes(
       new.user_id,
       (select n.kind from public.notifications n where n.id = new.notification_id)
     ) then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.hold_job_for_sabbatical() from public, anon, authenticated;
grant execute on function private.hold_job_for_sabbatical() to service_role;

drop trigger if exists sms_jobs_hold_for_sabbatical on public.sms_jobs;
create trigger sms_jobs_hold_for_sabbatical
  before insert on public.sms_jobs
  for each row execute function private.hold_job_for_sabbatical();

drop trigger if exists notification_email_jobs_hold_for_sabbatical on public.notification_email_jobs;
create trigger notification_email_jobs_hold_for_sabbatical
  before insert on public.notification_email_jobs
  for each row execute function private.hold_job_for_sabbatical();

-- ————————————————————————— Mutual —————————————————————————

-- The author and block rules (F6) and the discoverability standing for a
-- discovery interest (20260930042000) are kept exactly; the last clause is new.
alter policy mutual_intents_own on public.mutual_intents
  with check (
    author_id = (select auth.uid())
    and (target_id is null or not private.are_blocked((select auth.uid()), target_id))
    and (
      kind <> 'discover_connect'
      or status <> 'active'
      or exists (
        select 1
        from public.profiles me
        where me.id = (select auth.uid())
          and me.discoverable
          and not coalesce(me.sabbatical, false)
      )
    )
    and (
      kind not in ('down_to_connect', 'discover_connect')
      or status <> 'active'
      or not exists (
        select 1
        from public.profiles p
        where p.id in ((select auth.uid()), target_id)
          and coalesce(p.sabbatical, false)
      )
    )
  );
