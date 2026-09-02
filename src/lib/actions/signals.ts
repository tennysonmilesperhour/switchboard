'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';

const DEFAULT_DURATION_HOURS = 3;

/**
 * Turn a single availability signal on. Signals stack - several can be live at
 * once - and each carries the audience set the bar currently shows. An empty
 * `circleIds` means "everyone I know"; otherwise it's the union of the chosen
 * circles.
 */
export async function addSignal(
  emoji: string,
  label: string,
  circleIds: string[],
  durationHours: number = DEFAULT_DURATION_HOURS,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const cleanLabel = label.trim().replace(/[\r\n]+/g, ' ').slice(0, 40);
  const cleanEmoji = emoji.trim().slice(0, 12);
  if (!cleanLabel || !cleanEmoji) return validation('Add an emoji and a short status.');

  // Signals stay quiet during a sabbatical.
  const { data: profile } = await supabase
    .from('profiles')
    .select('sabbatical')
    .eq('id', user.id)
    .single();
  if (profile?.sabbatical) {
    return failure('SB-SIGNAL-PAUSED');
  }

  // Re-toggling the same signal simply refreshes it rather than duplicating.
  await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id)
    .eq('label', cleanLabel);

  const expiresAt = new Date(
    Date.now() + durationHours * 3_600_000,
  ).toISOString();
  const { error } = await supabase.from('availability_signals').insert({
    user_id: user.id,
    emoji: cleanEmoji,
    label: cleanLabel,
    circle_ids: circleIds,
    expires_at: expiresAt,
  });
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.add', error);
  revalidatePath('/');
  return { ok: true };
}

/** Turn a single availability signal off, leaving the others live. */
export async function removeSignal(
  label: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id)
    .eq('label', label);
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.remove', error);
  revalidatePath('/');
  return { ok: true };
}

/**
 * Re-point every live signal at a new audience: everyone (empty array), or the
 * union of one or more circles.
 */
export async function setSignalsAudience(
  circleIds: string[],
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('availability_signals')
    .update({ circle_ids: circleIds })
    .eq('user_id', user.id);
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.audience', error);
  revalidatePath('/');
  return { ok: true };
}

/** Turn every signal off at once. */
export async function clearSignal(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const { error } = await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id);
  if (error) return reportAndFail('SB-SIGNAL-SAVE', 'signal.clear', error);
  revalidatePath('/');
  return { ok: true };
}
