'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import type { ActionResult } from '@/lib/errors';
import { validation } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';

/**
 * Primary host adds a co-host by handle. Co-hosts share host powers (editing
 * the plan, approving join requests, confirming/cancelling). Only the primary
 * host can manage the co-host list — RLS enforces that on event_cohosts.
 */
export async function addCoHost(
  eventId: string,
  handle: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanHandle = handle.trim().toLowerCase().replace(/^@/, '');
  if (!cleanHandle) return validation('Enter a handle.');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('handle', cleanHandle)
    .maybeSingle();
  if (!profile) return validation('No one with that handle.');
  if (profile.id === user.id) {
    return validation('You’re already the host.');
  }

  const { error } = await supabase.from('event_cohosts').insert({
    event_id: eventId,
    cohost_id: profile.id,
    added_by: user.id,
  });
  if (error) {
    const already = error.code === '23505';
    if (already) return validation('They’re already a co-host.');
    return reportAndFail('SB-PLAN-SAVE', 'event.cohost-add', error, { eventId });
  }

  // Bring them into the Living Room so they can coordinate. Best-effort:
  // they may already be a member.
  const { data: event } = await supabase
    .from('events')
    .select('room_id')
    .eq('id', eventId)
    .maybeSingle();
  if (event?.room_id) {
    await supabase
      .from('room_members')
      .insert({ room_id: event.room_id, member_id: profile.id });
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Primary host takes someone off the co-host list. RLS on event_cohosts is the
 * gate; a write error is reported rather than dropped, so the panel can say the
 * co-host is still there instead of refreshing onto an unchanged list.
 */
export async function removeCoHost(
  eventId: string,
  cohostId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = await supabase
    .from('event_cohosts')
    .delete()
    .eq('event_id', eventId)
    .eq('cohost_id', cohostId);
  if (error) {
    return reportAndFail('SB-PLAN-SAVE', 'event-update', error, {
      eventId,
      step: 'cohost-remove',
    });
  }
  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
