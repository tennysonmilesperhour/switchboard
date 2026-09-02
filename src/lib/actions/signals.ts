'use server';

import type { ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_DURATION_HOURS = 3;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

type SessionClient = Awaited<ReturnType<typeof createClient>>;

/** Reject foreign, malformed, and duplicate audience ids before any write. */
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

async function rememberSignalCircle(
  supabase: SessionClient,
  circleId: string | null,
): Promise<boolean> {
  if (!circleId) return true;
  const { error } = await supabase.rpc('set_my_signal_default_circle', {
    p_circle: circleId,
  });
  return !error;
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
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const cleanLabel = label.trim().replace(/[\r\n]+/g, ' ').slice(0, 40);
  const cleanEmoji = emoji.trim().slice(0, 12);
  if (!cleanLabel || !cleanEmoji) return { ok: false, error: 'Add an emoji and a short status.' };

  // Signals stay quiet during a sabbatical.
  const { data: profile } = await supabase
    .from('profiles')
    .select('sabbatical')
    .eq('id', user.id)
    .single();
  if (profile?.sabbatical) {
    return { ok: false, error: 'Signals are paused while you’re on sabbatical.' };
  }

  const audience = await ownedCircleAudience(supabase, user.id, circleIds);
  if (!audience) {
    return { ok: false, error: 'Choose circles from your own list.' };
  }
  if (!(await rememberSignalCircle(supabase, audience.at(-1) ?? null))) {
    return { ok: false, error: 'Could not save your signal audience.' };
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
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}

/** Turn a single availability signal off, leaving the others live. */
export async function removeSignal(
  label: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const { error } = await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id)
    .eq('label', label);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}

/**
 * Re-point every live signal at a new audience: everyone (empty array), or the
 * union of one or more circles.
 */
export async function setSignalsAudience(
  circleIds: string[],
  rememberedCircleId: string | null,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const audience = await ownedCircleAudience(supabase, user.id, circleIds);
  if (!audience) {
    return { ok: false, error: 'Choose circles from your own list.' };
  }
  if (
    rememberedCircleId !== null &&
    (!audience.includes(rememberedCircleId) ||
      !(await rememberSignalCircle(supabase, rememberedCircleId)))
  ) {
    return { ok: false, error: 'Could not save your signal audience.' };
  }
  const { error } = await supabase
    .from('availability_signals')
    .update({ circle_ids: audience })
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}

/** Turn every signal off at once. */
export async function clearSignal(): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const { error } = await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}
