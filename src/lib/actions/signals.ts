'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';
import type { createClient } from '@/lib/supabase/server';

const DEFAULT_DURATION_HOURS = 3;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Reject foreign, malformed, and duplicate audience ids before any write.
 *
 * The RLS policy on `availability_signals` already refuses to show a signal to
 * anyone outside a circle its *owner* owns (`viewer_in_signal_audience`), so a
 * foreign id could never widen who sees a signal — but it would still be stored
 * and remembered as a preference, which is how a stranger's circle id would
 * end up on this person's profile. The circles read goes through the caller's
 * own RLS client, so a row that comes back is one they own.
 */
async function ownedCircleAudience(
  supabase: SessionClient,
  userId: string,
  rawCircleIds: string[],
): Promise<string[] | null> {
  if (!Array.isArray(rawCircleIds) || rawCircleIds.length > 100) return null;
  const circleIds = [...new Set(rawCircleIds)];
  if (!circleIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))) {
    return null;
  }
  if (circleIds.length === 0) return [];

  const { data, error } = await supabase
    .from('circles')
    .select('id')
    .eq('owner_id', userId)
    .in('id', circleIds);
  if (error || data?.length !== circleIds.length) return null;
  return circleIds;
}

/**
 * Remember the circle a fresh composer should start from. The database re-checks
 * ownership (`set_my_signal_default_circle` and the profiles trigger), so this
 * is the second of two gates, not the only one.
 */
async function rememberSignalCircle(
  supabase: SessionClient,
  circleId: string | null,
): Promise<unknown> {
  if (!circleId) return null;
  const { error } = await supabase.rpc('set_my_signal_default_circle', {
    p_circle: circleId,
  });
  return error;
}

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

  const audience = await ownedCircleAudience(supabase, user.id, circleIds);
  if (!audience) return validation('Choose circles from your own list.');
  const rememberError = await rememberSignalCircle(supabase, audience.at(-1) ?? null);
  if (rememberError) {
    return reportAndFail('SB-SIGNAL-SAVE', 'signal.add', rememberError);
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
    circle_ids: audience,
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
 * union of one or more circles. `rememberedCircleId` is the circle the person
 * just chose, which becomes the default a fresh composer opens with; it has to
 * be part of the audience being saved.
 */
export async function setSignalsAudience(
  circleIds: string[],
  rememberedCircleId: string | null,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const audience = await ownedCircleAudience(supabase, user.id, circleIds);
  if (!audience) return validation('Choose circles from your own list.');
  if (rememberedCircleId !== null && !audience.includes(rememberedCircleId)) {
    return validation('Choose circles from your own list.');
  }
  const rememberError = await rememberSignalCircle(supabase, rememberedCircleId);
  if (rememberError) {
    return reportAndFail('SB-SIGNAL-SAVE', 'signal.audience', rememberError);
  }
  const { error } = await supabase
    .from('availability_signals')
    .update({ circle_ids: audience })
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
