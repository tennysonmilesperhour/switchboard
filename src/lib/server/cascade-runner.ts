import { createAdminClient } from '@/lib/supabase/admin';
import {
  advanceCascade,
  type CascadeConfig,
  type CascadeInvite,
} from '@/lib/engine/cascade';
import { sendPushToUsers } from '@/lib/server/notify';
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

  for (const update of updates) {
    await admin
      .from('invites')
      .update({
        status: update.status,
        ...(update.sentAt ? { sent_at: update.sentAt } : {}),
      })
      .eq('id', update.id);
  }

  // Notify newly-sent invitees (registered users only; guests get links).
  const sentIds = new Set(
    updates.filter((u) => u.status === 'sent').map((u) => u.id),
  );
  const notifyUsers = invites
    .filter((i) => sentIds.has(i.id) && i.invitee_id)
    .map((i) => i.invitee_id as string);
  if (notifyUsers.length > 0) {
    await sendPushToUsers(notifyUsers, {
      title: 'You’re invited ✉️',
      body: `${event.title} - you have a little while to respond.`,
      url: `/events/${event.id}`,
    });
  }
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
