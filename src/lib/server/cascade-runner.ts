import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceCascade,
  type CascadeConfig,
  type CascadeInvite,
} from '@/lib/engine/cascade';
import { sendPushToUsers } from '@/lib/server/notify';
import { sendEmails, looksLikeEmail, appUrl } from '@/lib/server/email';
import {
  guestInviteSmsText,
  looksLikePhoneNumber,
  sendSmsMessages,
} from '@/lib/server/sms';
import type { Invite, SwitchboardEvent } from '@/lib/types';

function toEngineInvite(invite: Invite): CascadeInvite {
  return {
    id: invite.id,
    position: invite.position,
    groupStage: invite.group_stage,
    status: invite.status,
    windowMinutes: invite.window_minutes,
    sentAt: invite.sent_at,
  };
}

function toEngineConfig(event: SwitchboardEvent): CascadeConfig {
  // "all at once" is just group mode with everyone in stage 0.
  return {
    mode: event.invite_mode === 'individual' ? 'individual' : 'group',
    capacity: event.capacity,
  };
}

async function deliverInvitations(
  event: SwitchboardEvent,
  invites: Invite[],
  sentIds: Set<string>,
): Promise<void> {
  const notifyUsers = invites
    .filter((invite) => sentIds.has(invite.id) && invite.invitee_id)
    .map((invite) => invite.invitee_id as string);
  if (notifyUsers.length > 0) {
    await sendPushToUsers(notifyUsers, {
      title: 'You’re invited ✉️',
      body: `${event.title} - you have a little while to respond.`,
      url: `/events/${event.id}`,
    });
  }

  const guestEmails = invites
    .filter(
      (invite) =>
        sentIds.has(invite.id) &&
        !invite.invitee_id &&
        invite.guest_token &&
        looksLikeEmail(invite.guest_contact),
    )
    .map((invite) => ({
      to: invite.guest_contact as string,
      subject: `You’re invited: ${event.title}`,
      text: guestInviteText(event, invite.guest_name, invite.guest_token as string),
    }));
  if (guestEmails.length > 0) await sendEmails(guestEmails);

  const smsInvites = invites
    .filter(
      (invite) =>
        sentIds.has(invite.id) &&
        invite.guest_token &&
        looksLikePhoneNumber(invite.guest_contact),
    )
    .map((invite) => ({
      to: invite.guest_contact as string,
      body: invite.invitee_id
        ? `You are invited to ${event.title} on Switchboard: ${appUrl(`/events/${event.id}`)}`
        : guestInviteSmsText(event.title, invite.guest_token as string),
    }));
  if (smsInvites.length > 0) await sendSmsMessages(smsInvites);
}

/** Deliver the already-live first wave created by the atomic publish RPC. */
export async function notifyCurrentInviteWave(eventId: string): Promise<void> {
  const admin = createAdminClient();
  const [{ data: event }, { data: invites }] = await Promise.all([
    admin.from('events').select('*').eq('id', eventId).single<SwitchboardEvent>(),
    admin
      .from('invites')
      .select('*')
      .eq('event_id', eventId)
      .eq('status', 'sent')
      .returns<Invite[]>(),
  ]);
  if (!event || !invites?.length) return;
  await deliverInvitations(event, invites, new Set(invites.map((invite) => invite.id)));
}

/**
 * Server-authoritative cascade tick for one event. Called after any invite
 * response, on event page load (lazy), and from the cron sweep.
 */
export async function advanceEventCascade(eventId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single<SwitchboardEvent>();
  if (!event || event.status !== 'inviting') return;

  const { data: invites } = await admin
    .from('invites')
    .select('*')
    .eq('event_id', eventId)
    .returns<Invite[]>();
  if (!invites || invites.length === 0) return;

  const updates = advanceCascade(
    invites.map(toEngineInvite),
    toEngineConfig(event),
    new Date(),
  );
  if (updates.length === 0) return;

  // Apply every transition atomically under the event-row lock, guarded by each
  // invite's expected predecessor status and a capacity re-check. Returns the
  // invites actually sent, so we notify exactly those (a 'sent' is skipped if
  // the event filled between our snapshot read and the locked apply).
  const { data: sentRows } = await admin.rpc('apply_cascade_updates', {
    p_event: eventId,
    p_updates: updates,
  });

  const sentIds = new Set(
    ((sentRows as { sent_id: string }[] | null) ?? []).map((row) => row.sent_id),
  );
  await deliverInvitations(event, invites, sentIds);
}

function guestInviteText(
  event: SwitchboardEvent,
  guestName: string | null,
  token: string,
): string {
  const hello = guestName ? `Hi ${guestName},` : 'Hi there,';
  const when = event.starts_at
    ? new Date(event.starts_at).toLocaleString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : 'Time to be decided';
  const where = event.location_name ? `\nWhere: ${event.location_name}` : '';
  return (
    `${hello}\n\n` +
    `You’re invited to ${event.title}.\n` +
    `When: ${when}${where}\n\n` +
    `RSVP here (no account needed): ${appUrl(`/rsvp/${token}`)}\n\n` +
    `No pressure either way - if you can’t make it, the invitation quietly ` +
    `moves along.\n\n— Switchboard`
  );
}

/** Sweep every inviting event with an overdue live invite (cron entrypoint). */
export async function sweepCascades(): Promise<number> {
  const admin = createAdminClient();
  const { data: overdue } = await admin
    .from('invites')
    .select('event_id')
    .eq('status', 'sent')
    .not('sent_at', 'is', null);

  const eventIds = new Set<string>((overdue ?? []).map((row) => row.event_id));

  let advanced = 0;
  for (const eventId of eventIds) {
    await advanceEventCascade(eventId);
    advanced += 1;
  }
  // Also nudge inviting events with zero live invites (e.g. after restart).
  const { data: stalled } = await admin
    .from('events')
    .select('id')
    .eq('status', 'inviting');
  for (const event of stalled ?? []) {
    if (!eventIds.has(event.id)) {
      await advanceEventCascade(event.id);
      advanced += 1;
    }
  }
  return advanced;
}
