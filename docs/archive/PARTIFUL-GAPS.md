> **Archived 2026-08-11.** Write-up of the July 2026 hosting table-stakes pass.
> Several "still open" items have since shipped (co-hosts, themes UI, split the
> bill); the rest are carried forward in [`../DOCKET.md`](../DOCKET.md).

# Partiful gaps: what's standard, and what we shipped

Partiful is an invitation-and-event-page tool. Switchboard is a
social-mechanics tool (cascading invites, anonymous consensus, consent-gated
reveals). The goal here isn't to copy Partiful's blast-everything model - it's
to make sure the table-stakes hosting mechanics any guest or host expects are
present, delivered in Switchboard's calm, consent-first idiom.

## Shipped in this pass

The genuinely blocking gaps - the things that should just exist for this kind
of service - are done:

1. **Off-platform delivery (email).** `guest_contact` was captured but nothing
   was ever sent to it, so guest invites relied on the host manually pasting a
   link. Guests reachable by email now get their invite, reminders, and
   announcements automatically - no phone number required (our deliberate
   divergence from Partiful's SMS). Graceful no-op with no provider configured.
   `src/lib/server/email.ts`, wired into `cascade-runner.ts`.
2. **Automatic reminders.** A day-before nudge (3-24h out) to everyone who's in,
   plus a gentle nudge to anyone still holding an invite, and a "starting soon"
   (<3h) reminder to attendees. Fires at most once per window; respects quiet
   hours. `src/lib/server/reminders.ts`, swept by the existing cron.
3. **Host announcements (the calm "text blast").** One-way host broadcast to
   everyone who's in - door code, running late, bring a jacket. Lands on the
   event page, in the Living Room, and as push/email. `announcements` table,
   `src/lib/actions/announcements.ts`, `components/events/Announcements.tsx`.
4. **Per-guest RSVP questions.** Host-defined intake (dietary needs, what are
   you bringing) asked on accept; answers visible only to the host. Works for
   members and token-link guests. `event_questions` + `invite_answers` tables.
5. **Cover image, wishlist/registry link, one-tap Google Calendar, guest-list
   CSV export, and Run It Back** (re-invite the same crew minus the "not my
   thing" folks into a fresh plan).

All additive: new migration `20260706120000_partiful_gaps.sql`, build/lint/tests
green, pure logic unit-tested (`reminders`, `email`, `calendar-links`).

## Deliberately different (not copied)

- **No SMS / no phone requirement.** Email reach instead; a guest never hands
  over a number to RSVP.
- **No maximalist "bouncing bubbles" aesthetic.** A single cover image and a
  restrained theme field, not confetti. Restraint is the differentiation.

## Already covered better than Partiful

RSVP-without-account (token links), date polling (Anonymous Weighted Input),
recurring events (Standing Rituals), public/open events (Open Table, Zones),
guest approval (`request_to_join` / `approve_join_request`).

## Still open (next passes)

Themes UI, shared photo album + video (overlaps Memory Capsules), collaborative
playlist, map/weather embeds, co-hosts and plus-ones (need a permission model -
see `INNOVATIONS.md` #4/#15), Split the Bill (#7), full edit-and-notify UI.
