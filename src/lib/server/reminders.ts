import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { sendEmails, looksLikeEmail, appUrl } from '@/lib/server/email';
import { sendSmsMessages, looksLikePhoneNumber } from '@/lib/server/sms';
import { formatDateTime } from '@/lib/format';
import type { SwitchboardEvent } from '@/lib/types';

export type ReminderKind = 'day_before' | 'soon';

const HOUR = 3_600_000;

/**
 * Which reminders are due for an event right now. Pure and side-effect free
 * so the scheduling rule is unit-tested in isolation.
 *
 *  - day_before: fires once when the event is 3-24h out. Goes to everyone
 *    who's in, plus a gentle nudge to anyone still sitting on an invite.
 *  - soon: fires once when the event is under 3h out. Goes to attendees only.
 *
 * A reminder never fires if its marker column is already set, so the sweep is
 * idempotent and safe to run every minute.
 */
export function dueReminders(
  event: Pick<
    SwitchboardEvent,
    | 'starts_at'
    | 'status'
    | 'reminders_enabled'
    | 'reminded_day_before_at'
    | 'reminded_soon_at'
  >,
  now: Date = new Date(),
): ReminderKind[] {
  if (!event.reminders_enabled) return [];
  if (event.status !== 'inviting' && event.status !== 'confirmed') return [];
  if (!event.starts_at) return [];

  const untilMs = new Date(event.starts_at).getTime() - now.getTime();
  if (untilMs <= 0) return [];

  const due: ReminderKind[] = [];
  if (untilMs <= 24 * HOUR && untilMs > 3 * HOUR && !event.reminded_day_before_at) {
    due.push('day_before');
  }
  if (untilMs <= 3 * HOUR && !event.reminded_soon_at) {
    due.push('soon');
  }
  return due;
}

async function remindOneEvent(
  admin: ReturnType<typeof createAdminClient>,
  event: SwitchboardEvent,
  kind: ReminderKind,
): Promise<void> {
  // Claim this reminder window atomically FIRST. Two overlapping cron runs can
  // both see a null marker; the conditional `is null` update lets exactly one
  // win, and the loser affects no rows and bails, so a reminder never fires
  // twice.
  const column = kind === 'soon' ? 'reminded_soon_at' : 'reminded_day_before_at';
  const claimedAt = new Date().toISOString();
  const update =
    kind === 'soon'
      ? { reminded_soon_at: claimedAt }
      : { reminded_day_before_at: claimedAt };
  const { data: claimed } = await admin
    .from('events')
    .update(update)
    .eq('id', event.id)
    .is(column, null)
    .select('id');
  if (!claimed || claimed.length === 0) return;

  const { data: invites } = await admin
    .from('invites')
    .select('invitee_id, guest_name, guest_contact, guest_token, status')
    .eq('event_id', event.id);
  const rows = invites ?? [];

  const accepted = rows.filter((i) => i.status === 'accepted');
  // In the plan's own zone — a reminder email/push has no viewer zone, so
  // without this it would announce the server's UTC time.
  const when = formatDateTime(event.starts_at, event.time_zone);
  const url = `/events/${event.id}`;

  // Registered attendees → in-app notification (always) + push (quiet-hours
  // aware). Recording the in-app row is what fixes SB-06: the reminder window
  // is claimed before sending, and push silently drops quiet-hours users, so a
  // push-only "starting soon" landing in quiet hours was lost forever. The
  // in-app row is never quiet-hours gated, so the reminder still surfaces.
  const attendeeUsers = accepted
    .map((i) => i.invitee_id)
    .filter((id): id is string => Boolean(id));
  if (attendeeUsers.length > 0) {
    await notifyUsers(attendeeUsers, {
      kind: 'reminder',
      title: kind === 'soon' ? 'Starting soon ⏰' : 'Coming up tomorrow 📅',
      body: `${event.title} - ${when}.`,
      url,
    });
  }

  // Guest attendees reachable by email.
  const attendeeEmails = accepted
    .filter((i) => !i.invitee_id && looksLikeEmail(i.guest_contact) && i.guest_token)
    .map((i) => ({
      to: i.guest_contact as string,
      subject:
        kind === 'soon'
          ? `Starting soon: ${event.title}`
          : `Reminder: ${event.title}`,
      text:
        `Hi ${i.guest_name ?? 'there'},\n\n` +
        `${event.title} is ${kind === 'soon' ? 'starting soon' : 'coming up'} - ${when}.\n` +
        (event.location_name ? `Where: ${event.location_name}\n` : '') +
        `\nDetails: ${appUrl(`/rsvp/${i.guest_token}`)}\n\n- Switchboard`,
    }));

  // Guest attendees reachable by phone → the same reminder over SMS.
  const attendeeTexts = accepted
    .filter((i) => !i.invitee_id && looksLikePhoneNumber(i.guest_contact) && i.guest_token)
    .map((i) => ({
      to: i.guest_contact as string,
      body:
        `${event.title} is ${kind === 'soon' ? 'starting soon' : 'coming up'} - ${when}. ` +
        (event.location_name ? `At ${event.location_name}. ` : '') +
        `Details: ${appUrl(`/rsvp/${i.guest_token}`)}`,
    }));

  // On the day-before pass, gently nudge people still holding a live invite.
  let nudgeEmails: typeof attendeeEmails = [];
  let nudgeTexts: typeof attendeeTexts = [];
  if (kind === 'day_before') {
    const pending = rows.filter((i) => i.status === 'sent');
    const pendingUsers = pending
      .map((i) => i.invitee_id)
      .filter((id): id is string => Boolean(id));
    if (pendingUsers.length > 0) {
      await notifyUsers(pendingUsers, {
        kind: 'reminder',
        title: 'Still hoping you can make it 💛',
        body: `${event.title} - ${when}. Your invitation is still open.`,
        url,
      });
    }
    nudgeEmails = pending
      .filter((i) => !i.invitee_id && looksLikeEmail(i.guest_contact) && i.guest_token)
      .map((i) => ({
        to: i.guest_contact as string,
        subject: `Still hoping you can make it: ${event.title}`,
        text:
          `Hi ${i.guest_name ?? 'there'},\n\n` +
          `${event.title} is coming up - ${when}. Your invitation is still ` +
          `open, no pressure.\n\nRSVP: ${appUrl(`/rsvp/${i.guest_token}`)}\n\n- Switchboard`,
      }));
    nudgeTexts = pending
      .filter((i) => !i.invitee_id && looksLikePhoneNumber(i.guest_contact) && i.guest_token)
      .map((i) => ({
        to: i.guest_contact as string,
        body:
          `${event.title} is coming up - ${when}. Your invite is still open, ` +
          `no pressure: ${appUrl(`/rsvp/${i.guest_token}`)}`,
      }));
  }

  if (attendeeEmails.length + nudgeEmails.length > 0) {
    await sendEmails([...attendeeEmails, ...nudgeEmails]);
  }
  if (attendeeTexts.length + nudgeTexts.length > 0) {
    await sendSmsMessages([...attendeeTexts, ...nudgeTexts]);
  }
  // The window was already marked (claimed) at the top of this function.
}

/** Sweep every upcoming event and fire any reminders that are due. */
export async function sweepReminders(now: Date = new Date()): Promise<number> {
  const admin = createAdminClient();
  const horizon = new Date(now.getTime() + 26 * HOUR).toISOString();

  const { data: events } = await admin
    .from('events')
    .select('*')
    .in('status', ['inviting', 'confirmed'])
    .eq('reminders_enabled', true)
    .not('starts_at', 'is', null)
    .gt('starts_at', now.toISOString())
    .lt('starts_at', horizon);

  let sent = 0;
  for (const event of events ?? []) {
    for (const kind of dueReminders(event, now)) {
      await remindOneEvent(admin, event, kind);
      sent += 1;
    }
  }
  return sent;
}
