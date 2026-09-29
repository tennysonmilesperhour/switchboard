import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager } from '@/lib/server/authz';
import { advanceEventCascade } from '@/lib/server/cascade-runner';
import { runItBackCrew } from '@/lib/run-it-back';

/**
 * Clone a plan into a fresh one - same crew, same place, carrying the invite
 * mode, visibility, presentation, and recurrence forward. Anyone who said "not
 * my thing" is quietly left off; everyone else keeps their place in the order.
 * `startsAt` lets the caller either leave the new date TBD (Run It Back) or
 * pre-fill the next occurrence (a recurring plan's "Schedule the next one").
 * Returns the new event id, or null if the source can't be cloned by this user.
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
): Promise<string | null> {
  const supabase = await createClient();
  const manager = await checkEventManager(userId, sourceId);
  if (!manager.ok || !manager.isManager) return null;

  const { data: source } = await supabase
    .from('events')
    .select('*')
    .eq('id', sourceId)
    .single();
  if (!source || source.host_id !== userId) return null;

  // Writes go through the service-role client for the same reason as
  // createEvent: the host can't read back a room they don't yet belong to
  // under RLS. Ownership is pinned to the authenticated user on every row.
  const admin = createAdminClient();

  const { data: room } = await admin
    .from('rooms')
    .insert({ kind: 'event', title: source.title, created_by: userId })
    .select('id')
    .single();
  if (room) {
    await admin.from('room_members').insert({ room_id: room.id, member_id: userId });
  }

  const { data: clone } = await admin
    .from('events')
    .insert({
      host_id: userId,
      title: source.title,
      description: source.description,
      location_name: source.location_name,
      location_address: source.location_address,
      starts_at: startsAt,
      // Same host, same crew — carry the zone so the reused plan renders in the
      // host's local time even before a new date is picked.
      time_zone: source.time_zone,
      capacity: source.capacity,
      invite_mode: source.invite_mode,
      open_table: source.open_table,
      status: 'inviting',
      show_invite_list: source.show_invite_list,
      show_accepted: source.show_accepted,
      show_expired: source.show_expired,
      cover_url: source.cover_url,
      theme: source.theme,
      wishlist_url: source.wishlist_url,
      // The host's rules for who may come and how they're reminded carry over
      // with the crew. Leaving these to the column defaults quietly dropped a
      // youth plan's guardian approval on every Run it back.
      parental_approval: source.parental_approval,
      reminders_enabled: source.reminders_enabled,
      // Keep it a standing plan: the clone repeats on the same cadence.
      recurrence: source.recurrence,
      recurrence_interval_days: source.recurrence_interval_days,
      room_id: room?.id ?? null,
    })
    .select('id')
    .single();
  if (!clone) return null;

  const { data: priorInvites } = await supabase
    .from('invites')
    .select('invitee_id, guest_name, guest_contact, position, group_stage, window_minutes, decline_note, status')
    .eq('event_id', sourceId)
    .order('position');

  const carryOver = runItBackCrew(priorInvites ?? [], userId);
  if (carryOver.length > 0) {
    await admin.from('invites').insert(
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
  }

  const { data: questions } = await supabase
    .from('event_questions')
    .select('prompt, required, position, kind, options')
    .eq('event_id', sourceId);
  if (questions && questions.length > 0) {
    await admin.from('event_questions').insert(
      questions.map((q) => ({ ...q, event_id: clone.id })),
    );
  }

  try {
    await advanceEventCascade(clone.id);
  } catch (cascadeError) {
    console.error('Failed to start cascade for reused plan', cascadeError);
  }

  return clone.id as string;
}
