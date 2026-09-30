'use server';

import { revalidatePath } from 'next/cache';

import { validation, type ActionResult } from '@/lib/errors';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

/**
 * Clear a match off your own Home, or put it back.
 *
 * Both halves are one person's private housekeeping. The `matches` row is
 * shared between the two people in it and is never written from here — the
 * dismissal is a separate row keyed by (match, person), so clearing a card
 * changes nothing the other person sees and un-matches nobody. `/mutual` still
 * lists everything, which is what makes this safe to do on a single tap
 * without a confirmation step.
 *
 * `restore` exists because the gesture is easy to fire by accident on a phone.
 * A swipe with no way back is a trap, so the undo path is a first-class action
 * rather than a client-side re-render.
 */
export async function dismissMatch(matchId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // Upsert, not insert: dismissing something already dismissed (two taps, a
  // retry after a flaky connection) is the same request twice, and should end
  // in the same place rather than a duplicate-key error the reader can't act on.
  const { error } = await supabase
    .from('match_dismissals')
    .upsert(
      { match_id: matchId, user_id: user.id, dismissed_at: new Date().toISOString() },
      { onConflict: 'match_id,user_id' },
    );
  if (error) return reportAndFail('SB-MATCH-CLEAR', 'match.dismiss', error);

  revalidatePath('/');
  return { ok: true };
}

/** Undo a dismissal — the match returns to Home in its original date order. */
export async function restoreMatch(matchId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  // RLS already limits deletes to the caller's own rows; the explicit user_id
  // filter states the same thing in the query, so a policy change can never
  // silently widen this into "clear everyone's dismissal of this match".
  const { error } = await supabase
    .from('match_dismissals')
    .delete()
    .eq('match_id', matchId)
    .eq('user_id', user.id);
  if (error) return reportAndFail('SB-MATCH-CLEAR', 'match.restore', error);

  revalidatePath('/');
  return { ok: true };
}

/**
 * Unmatch (G37): end a match for both people. The match row, its room and the
 * interest behind it all go together inside `unmatch`, which checks that the
 * caller is one of the two people. Neither person is notified.
 */
export async function unmatch(matchId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { data, error } = await auth.supabase.rpc('unmatch', { p_match: matchId });
  if (error) return reportAndFail('SB-MUTUAL-SAVE', 'mutual.unmatch', error, { matchId });
  if (data !== 'unmatched') return validation('That match is already gone.');

  revalidatePath('/mutual');
  revalidatePath('/rooms');
  revalidatePath('/');
  return { ok: true };
}
