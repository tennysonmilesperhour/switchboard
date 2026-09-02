'use server';

import { revalidatePath } from 'next/cache';

import type { ActionResult } from '@/lib/errors';
import { failure, validation } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { isEventManager } from '@/lib/server/authz';
import { reportAndFail } from '@/lib/server/observability';
import {
  gridSlots,
  recommendAvailability,
  type AvailabilitySnapshot,
  type SlotCount,
} from '@/lib/availability';

/**
 * Replace this person's availability for a plan.
 *
 * Whole-set rather than per-cell: a grid is edited by dragging across it, and
 * a request per cell would be both chatty and half-applied the moment one
 * fails. Replacing the set in one database transaction keeps "what I marked"
 * and "what is stored" the same thing.
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
  const { supabase } = auth;

  const now = new Date();
  const allowed = new Set(gridSlots(now));
  const clean = [...new Set(slots)].filter((slot) => allowed.has(slot));
  if (clean.length !== new Set(slots).size) {
    // Not silently dropped: a client sending slots this grid never offered is
    // out of step with the server, and quietly storing the subset would show
    // them a heatmap that disagrees with what they just tapped.
    return failure('SB-FREE-SLOT');
  }

  // One transaction replaces the rows and records that this person answered.
  // Empty remains meaningful: "none of these work" must not look like silence
  // when recommendations decide whether enough of the group has replied.
  const { error } = await supabase.rpc('replace_event_availability', {
    p_event: eventId,
    p_slots: clean,
  });
  if (error) {
    return reportAndFail('SB-FREE-SAVE', 'availability.save', error);
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Read the group's heatmap.
 *
 * Through two aggregate-only doors: one returns per-slot counts and the other
 * returns participation totals. Individual rows are owner-only under RLS and
 * neither function returns a user id, so the roster remains unavailable even
 * to the host.
 */
export async function loadAvailability(eventId: string): Promise<AvailabilitySnapshot> {
  const supabase = await createClient();
  const [countResult, summaryResult] = await Promise.all([
    supabase.rpc('event_availability_counts', { p_event: eventId }),
    supabase.rpc('event_availability_summary', { p_event: eventId }).maybeSingle(),
  ]);
  const summary = summaryResult.data as
    | { responders: number; eligible_people: number }
    | null;
  return {
    counts: (countResult.data ?? []).map(
      (row: { slot: string; people: number; mine: boolean }): SlotCount => ({
        slot: row.slot,
        people: row.people,
        mine: row.mine,
      }),
    ),
    responders: summary?.responders ?? 0,
    eligiblePeople: summary?.eligible_people ?? 0,
  };
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

  const snapshot = await loadAvailability(eventId);
  const recommendation = recommendAvailability(snapshot, limit);
  if (recommendation.status !== 'ready') {
    return validation(recommendation.message);
  }
  const best = recommendation.slots;

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
