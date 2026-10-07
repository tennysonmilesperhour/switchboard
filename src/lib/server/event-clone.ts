import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager } from '@/lib/server/authz';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { notifyUsers } from '@/lib/server/notify';
import { openDecidingPlan } from '@/lib/server/poll-notices';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { failure, type ActionResult } from '@/lib/errors';
import { runItBackCrew } from '@/lib/run-it-back';

export type CloneResult = ActionResult & { eventId?: string };

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Clone a plan into a fresh one - same crew, same place, same co-hosts,
 * carrying the invite mode, visibility, presentation, questions and
 * recurrence forward. Anyone who said "not my thing" is left off; everyone
 * else keeps their place in the order.
 *
 * `startsAt` is the next date when the caller knows it (a recurring plan's
 * "Schedule the next one"): the clone goes straight out as invitations. When
 * it doesn't (Run it back), the clone opens as a date poll (decision D19) —
 * the crew is asked when works, the way a plan created as a vote is — instead
 * of going live with no date for anyone to answer.
 *
 * Every write is checked (G27). A failure part-way removes what was made and
 * returns a coded failure, so the host is told, and never lands on half a plan
 * or back on the old one with no word.
 *
 * A server-only module, never `'use server'`: it trusts the `userId` it is
 * handed, so it may only be called with the id from the caller's own session
 * (`runItBack` / `scheduleNextOccurrence`), never exposed as an action a
 * browser could call with somebody else's.
 */
export async function cloneEventForReuse(
  userId: string,
  sourceId: string,
  startsAt: string | null,
): Promise<CloneResult> {
  const supabase = await createClient();
  const manager = await checkEventManager(userId, sourceId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) return failure('SB-PERM-HOST', 'Only the host can run this plan back.');

  const { data: source, error: sourceError } = await supabase
    .from('events')
    .select('*')
    .eq('id', sourceId)
    .maybeSingle();
  if (sourceError) {
    return reportAndFail('SB-PLAN-CLONE', 'event.clone', sourceError, { sourceId, step: 'source' });
  }
  // Co-hosts help run a plan; starting the next one is the primary host's.
  if (!source || source.host_id !== userId) {
    return failure('SB-PERM-HOST', 'Only the plan’s main host can run it back.');
  }

  // Everything the new plan carries over, read through the host's own session
  // before anything is written, so a failed read leaves nothing behind.
  const [priorResult, questionResult, cohostResult] = await Promise.all([
    supabase
      .from('invites')
      .select('invitee_id, guest_name, guest_contact, position, group_stage, window_minutes, decline_note, status')
      .eq('event_id', sourceId)
      .order('position'),
    supabase
      .from('event_questions')
      .select('prompt, required, position, kind, options')
      .eq('event_id', sourceId),
    supabase.from('event_cohosts').select('cohost_id').eq('event_id', sourceId),
  ]);
  const readError = priorResult.error ?? questionResult.error ?? cohostResult.error;
  if (readError) {
    return reportAndFail('SB-PLAN-CLONE', 'event.clone', readError, { sourceId, step: 'carry-over' });
  }

  // Writes go through the service-role client for the same reason as
  // createEvent: the host can't read back a room they don't yet belong to
  // under RLS. Ownership is pinned to the authenticated user on every row.
  const admin = createAdminClient();
  const asPoll = !startsAt;

  const { data: room, error: roomError } = await admin
    .from('rooms')
    .insert({ kind: 'event', title: source.title, created_by: userId })
    .select('id')
    .single();
  if (roomError || !room) {
    return reportAndFail('SB-PLAN-CLONE', 'event.clone', roomError ?? 'no room', { sourceId, step: 'room' });
  }

  const { data: clone, error: eventError } = await admin
    .from('events')
    .insert({
      host_id: userId,
      title: source.title,
      description: source.description,
      location_name: source.location_name,
      location_address: source.location_address,
      latitude: source.latitude,
      longitude: source.longitude,
      starts_at: startsAt,
      // Same host, same crew — carry the zone so the reused plan renders in the
      // host's local time even before a new date is picked.
      time_zone: source.time_zone,
      capacity: source.capacity,
      invite_mode: source.invite_mode,
      open_table: source.open_table,
      broadcast_nearby: source.broadcast_nearby,
      status: asPoll ? 'deciding' : 'inviting',
      show_invite_list: source.show_invite_list,
      show_accepted: source.show_accepted,
      show_expired: source.show_expired,
      cover_url: source.cover_url,
      theme: source.theme,
      wishlist_url: source.wishlist_url,
      // The host's rules for who may come and how they're reminded carry over
      // with the crew. Leaving these to the column defaults dropped a youth
      // plan's guardian approval on every Run it back.
      parental_approval: source.parental_approval,
      reminders_enabled: source.reminders_enabled,
      // Keep it a standing plan: the clone repeats on the same cadence.
      recurrence: source.recurrence,
      recurrence_interval_days: source.recurrence_interval_days,
      room_id: room.id,
    })
    .select('id')
    .single();
  if (eventError || !clone) {
    await discard(admin, null, room.id);
    return reportAndFail('SB-PLAN-CLONE', 'event.clone', eventError ?? 'no event', { sourceId, step: 'event' });
  }

  const fail = async (step: string, error: unknown): Promise<CloneResult> => {
    await discard(admin, clone.id, room.id);
    return reportAndFail('SB-PLAN-CLONE', 'event.clone', error, { sourceId, step });
  };

  const { error: memberError } = await admin
    .from('room_members')
    .insert({ room_id: room.id, member_id: userId });
  if (memberError) return fail('room-member', memberError);

  if (asPoll) {
    // D19: the first question is when. Voters are the crew below; nobody is
    // invited until the host sends the invitations with the date that won.
    const { error } = await admin
      .from('polls')
      .insert({ event_id: clone.id, topic: 'date', phase: 'suggesting', resolution: 'host_pick' });
    if (error) return fail('poll', error);
  }

  const carryOver = runItBackCrew(priorResult.data ?? [], userId);
  if (carryOver.length > 0) {
    const { error } = await admin.from('invites').insert(
      carryOver.map((i, index) => ({
        event_id: clone.id,
        invitee_id: i.invitee_id,
        guest_name: i.guest_name,
        guest_contact: i.guest_contact,
        position: index,
        group_stage: i.group_stage,
        window_minutes: i.window_minutes,
      })),
    );
    if (error) return fail('invites', error);
  }

  const questions = questionResult.data ?? [];
  if (questions.length > 0) {
    const { error } = await admin
      .from('event_questions')
      .insert(questions.map((q) => ({ ...q, event_id: clone.id })));
    if (error) return fail('questions', error);
  }

  await carryCohosts(supabase, admin, {
    cloneId: clone.id,
    roomId: room.id,
    userId,
    title: source.title,
    cohostIds: (cohostResult.data ?? []).map((row) => row.cohost_id),
  });

  // The plan exists from here on; getting word out is best-effort, as it is for
  // a plan made in the wizard.
  try {
    if (asPoll) await openDecidingPlan(supabase, clone.id, userId, []);
    else await advanceEventCascade(clone.id);
  } catch (error) {
    await reportOperationalError('event-initial-delivery', error, { eventId: clone.id });
  }

  return { ok: true, eventId: clone.id };
}

/**
 * Carry the co-hosts over, each through the host's own session so the
 * `event_cohosts_host` policy decides (decision D1): someone who has since
 * blocked the host, or is no longer a connection or on the guest list, is
 * left off rather than handed the new plan. Each one who comes along joins
 * the room and is told, as `addCoHost` does.
 */
async function carryCohosts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  admin: Admin,
  plan: { cloneId: string; roomId: string; userId: string; title: string; cohostIds: string[] },
): Promise<void> {
  const carried: string[] = [];
  for (const cohostId of plan.cohostIds) {
    const { error } = await supabase
      .from('event_cohosts')
      .insert({ event_id: plan.cloneId, cohost_id: cohostId, added_by: plan.userId });
    if (!error) {
      carried.push(cohostId);
    } else if (error.code !== '42501') {
      // Not a refusal by the D1 rule: a real failure, logged with its code.
      // The plan stands; the host can add them again from Co-hosts.
      await reportOperationalError('event.clone', error, { eventId: plan.cloneId, step: 'cohosts' });
    }
  }
  if (carried.length === 0) return;

  const { error: roomError } = await admin
    .from('room_members')
    .upsert(carried.map((memberId) => ({ room_id: plan.roomId, member_id: memberId })));
  if (roomError) {
    await reportOperationalError('event.clone', roomError, { eventId: plan.cloneId, step: 'cohost-room' });
  }
  await notifyUsers(carried, {
    kind: 'cohost_added',
    title: 'You’re co-hosting',
    body: `You’re co-hosting ${plan.title} again.`,
    url: `/events/${plan.cloneId}`,
  });
}

/** Remove a half-made clone: the plan (its rows cascade) and its room. */
async function discard(admin: Admin, eventId: string | null, roomId: string): Promise<void> {
  if (eventId) {
    const { error } = await admin.from('events').delete().eq('id', eventId);
    if (error) await reportOperationalError('event.clone', error, { eventId, step: 'discard' });
  }
  const { error } = await admin.from('rooms').delete().eq('id', roomId);
  if (error) await reportOperationalError('event.clone', error, { roomId, step: 'discard' });
}
