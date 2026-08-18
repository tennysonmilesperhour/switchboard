'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/lib/errors';
import { failure } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { isEventManager } from '@/lib/server/authz';
import { reportAndFail } from '@/lib/server/observability';
import { gridSlots, isGridSlot, bestSlots, type SlotCount } from '@/lib/availability';

/**
 * Replace this person's availability for a plan.
 *
 * Whole-set rather than per-cell: a grid is edited by dragging across it, and
 * a request per cell would be both chatty and half-applied the moment one
 * fails. Delete-then-insert inside one action keeps "what I marked" and "what
 * is stored" the same thing.
 *
 * Every slot is checked against the grid the app actually offers. Without that,
 * the column is an arbitrary timestamp store that anyone could write anything
 * into, and the heatmap would render whatever they chose.
 */
export async function setAvailability(
  eventId: string,
  slots: string[],
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const now = new Date();
  const allowed = new Set(gridSlots(now));
  const clean = [...new Set(slots)].filter((slot) => allowed.has(slot));
  if (clean.length !== new Set(slots).size) {
    // Not silently dropped: a client sending slots this grid never offered is
    // out of step with the server, and quietly storing the subset would show
    // them a heatmap that disagrees with what they just tapped.
    return failure('SB-FREE-SLOT');
  }

  // Clearing your availability is a legitimate answer ("actually, none of
  // these"), so an empty set is a valid write rather than a no-op.
  const { error: clearError } = await supabase
    .from('event_availability')
    .delete()
    .eq('event_id', eventId)
    .eq('user_id', user.id);
  if (clearError) {
    return reportAndFail('SB-FREE-SAVE', 'availability.clear', clearError);
  }

  if (clean.length > 0) {
    const { error } = await supabase.from('event_availability').insert(
      clean.map((slot) => ({ event_id: eventId, user_id: user.id, slot })),
    );
    if (error) {
      // The RLS `with check` also requires can_view_event, so this is where a
      // stranger's write lands. Their availability is gone either way, which is
      // the safe end state.
      return reportAndFail('SB-FREE-SAVE', 'availability.save', error);
    }
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Read the group's heatmap.
 *
 * Through `event_availability_counts`, which is the only door: individual rows
 * are owner-only under RLS, and the function returns counts with no user id in
 * any column. See the migration for why the roster is deliberately not
 * available even to the host.
 */
export async function loadAvailability(eventId: string): Promise<SlotCount[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('event_availability_counts', {
    p_event: eventId,
  });
  return (data ?? []).map((row: { slot: string; people: number; mine: boolean }) => ({
    slot: row.slot,
    people: row.people,
    mine: row.mine,
  }));
}

/**
 * Turn the best-attended slots into options on the plan's date poll.
 *
 * This is the whole point of collecting availability: the heatmap tells you
 * when people are free, and the poll is where the group commits. Without this
 * step someone reads the grid, retypes three dates into the suggestion box, and
 * the two drift apart.
 *
 * Host-only, because it writes options everyone will then rank.
 */
export async function slotsToPollOptions(
  eventId: string,
  pollId: string,
  limit = 3,
): Promise<ActionResult & { added?: number }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  if (!(await isEventManager(user.id, eventId))) {
    return failure('SB-PLAN-ACCESS');
  }

  const counts = await loadAvailability(eventId);
  const best = bestSlots(counts, limit);
  if (best.length === 0) {
    return { ok: false, error: 'Nobody has marked when they’re free yet.' };
  }

  // The label is the instant, formatted by the client that renders it; storing
  // the ISO string in `detail` keeps the option machine-readable so picking a
  // winner can set the plan's date later without parsing prose.
  const { data: existing } = await supabase
    .from('poll_options')
    .select('detail')
    .eq('poll_id', pollId);
  const already = new Set((existing ?? []).map((row) => row.detail));

  const fresh = best.filter((slot) => !already.has(slot.slot));
  if (fresh.length === 0) return { ok: true, added: 0 };

  const { error } = await supabase.from('poll_options').insert(
    fresh.map((slot) => ({
      poll_id: pollId,
      label: new Date(slot.slot).toISOString(),
      detail: slot.slot,
      source: 'host',
    })),
  );
  if (error) {
    return reportAndFail('SB-FREE-POLL', 'availability.to-poll', error);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true, added: fresh.length };
}

/** Re-exported so a caller can validate before it asks the server to. */
export async function isOfferedSlot(slot: string): Promise<boolean> {
  return isGridSlot(slot, new Date());
}
