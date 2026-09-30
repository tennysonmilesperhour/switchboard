'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { checkEventManager } from '@/lib/server/authz';
import { cloneEventForReuse } from '@/lib/server/event-clone';
import { reportAndFail } from '@/lib/server/observability';
import { failure, type ActionResult } from '@/lib/errors';
import { nextOccurrenceAfter, normalizeCustomInterval } from '@/lib/engine/recurrence';
import type { RecurrenceKind } from '@/lib/types';

/**
 * Run It Back: clone a past plan into a fresh one - same people, same place,
 * same co-hosts. Anyone who said "not my thing" is left off; everyone else
 * keeps their place in the order (see `runItBackCrew` for who counts as crew).
 * The new plan opens as a date poll (decision D19): the crew picks when, and
 * the host sends the invitations once it's settled.
 *
 * Success lands the host on the new plan. A failure comes back with its code
 * (G27) — it used to redirect to the old plan and say nothing.
 */
export async function runItBack(eventId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const result = await cloneEventForReuse(auth.user.id, eventId, null);
  if (!result.ok || !result.eventId) return result.ok ? failure('SB-PLAN-CLONE') : result;
  revalidatePath('/plans');
  redirect(`/events/${result.eventId}`);
}

/**
 * Schedule the next occurrence of a recurring plan: clone the crew forward onto
 * the upcoming date its cadence produces. Host only. If the source doesn't
 * repeat or has no start time to count from, the new plan asks for a date the
 * same way Run it back does.
 */
export async function scheduleNextOccurrence(eventId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) return failure('SB-PERM-HOST', 'Only the host can schedule the next one.');

  const { data: source, error } = await supabase
    .from('events')
    .select('host_id, starts_at, recurrence, recurrence_interval_days')
    .eq('id', eventId)
    .maybeSingle();
  if (error) {
    return reportAndFail('SB-PLAN-CLONE', 'event.clone', error, { sourceId: eventId, step: 'next-date' });
  }
  if (!source || source.host_id !== user.id) {
    return failure('SB-PERM-HOST', 'Only the plan’s main host can schedule the next one.');
  }

  let startsAt: string | null = null;
  if (source.starts_at && source.recurrence && source.recurrence !== 'none') {
    const next = nextOccurrenceAfter(
      new Date(source.starts_at),
      source.recurrence as RecurrenceKind,
      normalizeCustomInterval(source.recurrence_interval_days),
      new Date(),
    );
    startsAt = next ? next.toISOString() : null;
  }

  const result = await cloneEventForReuse(user.id, eventId, startsAt);
  if (!result.ok || !result.eventId) return result.ok ? failure('SB-PLAN-CLONE') : result;
  revalidatePath('/plans');
  redirect(`/events/${result.eventId}`);
}
