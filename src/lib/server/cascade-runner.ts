import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceCascade,
  type CascadeConfig,
  type CascadeInvite,
} from '@/lib/engine/cascade';
import { notifyUsers } from '@/lib/server/notify';
import {
  looksLikeEmail,
  appUrl,
  sendEmailWithResult,
  type DeliveryStatus,
} from '@/lib/server/email';
import { formatDateTime } from '@/lib/format';
import {
  guestInviteSmsText,
  looksLikePhoneNumber,
  sendSmsWithResult,
} from '@/lib/server/sms';
import type { Invite, SwitchboardEvent } from '@/lib/types';
import { directInvitePath } from '@/lib/invite-links';

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

export interface InvitationDeliverySummary {
  sent: number;
  notConfigured: number;
  failed: number;
  invalidRecipient: number;
  manual: number;
}

interface DeliveryAttemptRow {
  invite_id: string;
  channel: 'in_app' | 'email' | 'sms';
  status: DeliveryStatus;
  provider: string;
  provider_message_id: string | null;
  error_code: string | null;
}

function emptyDeliverySummary(): InvitationDeliverySummary {
  return { sent: 0, notConfigured: 0, failed: 0, invalidRecipient: 0, manual: 0 };
}

function countDelivery(summary: InvitationDeliverySummary, status: DeliveryStatus): void {
  if (status === 'sent') summary.sent += 1;
  else if (status === 'not_configured') summary.notConfigured += 1;
  else if (status === 'invalid_recipient') summary.invalidRecipient += 1;
  else summary.failed += 1;
}

async function deliverInvitations(
  event: SwitchboardEvent,
  invites: Invite[],
  sentIds: Set<string>,
): Promise<InvitationDeliverySummary> {
  const summary = emptyDeliverySummary();
  const attempts: DeliveryAttemptRow[] = [];
  const current = invites.filter((invite) => sentIds.has(invite.id));

  await Promise.all(current.map(async (invite) => {
    let hasChannel = false;
    // One canonical destination for every direct invite. In particular, do not
    // send registered members to the RLS-gated event URL: it fails when opened
    // signed out, in another browser, or under a different account. Possession
    // of this per-invite token is already the authorization used by guest RSVP.
    const invitePath = directInvitePath(event.id, invite.guest_token);

    if (invite.invitee_id) {
      hasChannel = true;
      const result = await notifyUsers([invite.invitee_id], {
        kind: 'event_invite',
        title: 'You are invited',
        body: `${event.title} - you have a little while to respond.`,
        url: invitePath,
      });
      const status: DeliveryStatus = result.recorded ? 'sent' : 'failed';
      countDelivery(summary, status);
      attempts.push({
        invite_id: invite.id,
        channel: 'in_app',
        status,
        provider: 'switchboard',
        provider_message_id: null,
        error_code: result.recorded ? null : 'notification_insert_failed',
      });
    }

    if (invite.guest_token && looksLikeEmail(invite.guest_contact)) {
      hasChannel = true;
      const result = await sendEmailWithResult({
        to: invite.guest_contact,
        subject: `You are invited: ${event.title}`,
        text: invite.invitee_id
          ? memberInviteText(event, invitePath)
          : guestInviteText(event, invite.guest_name, invite.guest_token),
      });
      countDelivery(summary, result.status);
      attempts.push({
        invite_id: invite.id,
        channel: 'email',
        status: result.status,
        provider: result.provider,
        provider_message_id: result.providerMessageId ?? null,
        error_code: result.errorCode ?? null,
      });
    }

    if (invite.guest_token && looksLikePhoneNumber(invite.guest_contact)) {
      hasChannel = true;
      const result = await sendSmsWithResult({
        to: invite.guest_contact,
        body: invite.invitee_id
          ? `You are invited to ${event.title} on Switchboard: ${appUrl(invitePath)}`
          : guestInviteSmsText(event.title, invite.guest_token),
      });
      countDelivery(summary, result.status);
      attempts.push({
        invite_id: invite.id,
        channel: 'sms',
        status: result.status,
        provider: result.provider,
        provider_message_id: result.providerMessageId ?? null,
        error_code: result.errorCode ?? null,
      });
    }

    if (!hasChannel) summary.manual += 1;
  }));

  if (attempts.length > 0) {
    const admin = createAdminClient();
    const { error } = await admin.from('invite_delivery_attempts').insert(attempts);
    if (error) console.error('[invite-delivery:record]', error.message);
  }

  return summary;
}

/** Deliver the already-live first wave created by the atomic publish RPC. */
export async function notifyCurrentInviteWave(
  eventId: string,
): Promise<InvitationDeliverySummary> {
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
  if (!event || !invites?.length) return emptyDeliverySummary();
  return deliverInvitations(event, invites, new Set(invites.map((invite) => invite.id)));
}

/**
 * Server-authoritative cascade tick for one event. Called after any invite
 * response, on event page load (lazy), and from the cron sweep.
 */
export async function advanceEventCascade(
  eventId: string,
): Promise<InvitationDeliverySummary> {
  const admin = createAdminClient();

  const { data: event } = await admin
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single<SwitchboardEvent>();
  if (!event || event.status !== 'inviting') return emptyDeliverySummary();

  const { data: invites } = await admin
    .from('invites')
    .select('*')
    .eq('event_id', eventId)
    .returns<Invite[]>();
  if (!invites || invites.length === 0) return emptyDeliverySummary();

  const updates = advanceCascade(
    invites.map(toEngineInvite),
    toEngineConfig(event),
    new Date(),
  );
  if (updates.length === 0) return emptyDeliverySummary();

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
  return deliverInvitations(event, invites, sentIds);
}

function memberInviteText(event: SwitchboardEvent, invitePath: string): string {
  const when = event.starts_at
    ? formatDateTime(event.starts_at, event.time_zone)
    : 'Time to be decided';
  return (
    `You are invited to ${event.title}.\n` +
    `When: ${when}\n\n` +
    `Open the plan: ${appUrl(invitePath)}\n\n` +
    `No pressure either way.\n\n- Switchboard`
  );
}

function guestInviteText(
  event: SwitchboardEvent,
  guestName: string | null,
  token: string,
): string {
  const hello = guestName ? `Hi ${guestName},` : 'Hi there,';
  // In the plan's own zone with a label — an invite email/SMS has no viewer
  // zone, so without this it would announce the server's UTC time.
  const when = event.starts_at
    ? formatDateTime(event.starts_at, event.time_zone)
    : 'Time to be decided';
  const where = event.location_name ? `\nWhere: ${event.location_name}` : '';
  return (
    `${hello}\n\n` +
    `You’re invited to ${event.title}.\n` +
    `When: ${when}${where}\n\n` +
    // Set the expectation the link actually meets: it opens straight to the
    // plan, and the sign-in is only asked for at the moment they answer.
    `See the plan here: ${appUrl(`/rsvp/${token}`)}\n` +
    `(Sign in - or make an account - when you’re ready to reply.)\n\n` +
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
