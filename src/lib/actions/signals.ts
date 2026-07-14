'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_DURATION_HOURS = 3;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Turn a single availability signal on. Signals stack - several can be live at once. */
export async function addSignal(
  emoji: string,
  label: string,
  circleId: string | null,
  durationHours: number = DEFAULT_DURATION_HOURS,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  // Signals stay quiet during a sabbatical.
  const { data: profile } = await supabase
    .from('profiles')
    .select('sabbatical')
    .eq('id', user.id)
    .single();
  if (profile?.sabbatical) {
    return { ok: false, error: 'Signals are paused while you’re on sabbatical.' };
  }

  // Re-toggling the same signal simply refreshes it rather than duplicating.
  await supabase
    .from('availability_signals')
    .delete()
    .eq('user_id', user.id)
    .eq('label', label);

  const expiresAt = new Date(
    Date.now() + durationHours * 3_600_000,
  ).toISOString();
  const { error } = await supabase.from('availability_signals').insert({
    user_id: user.id,
    emoji,
    label,
    circle_id: circleId,
    expires_at: expiresAt,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}

/** Turn a single availability signal off, leaving the others live. */
export async function removeSignal(
  label: string,
): Promise<{ ok: boolean; error?: string }> {
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

/** Re-point every live signal at a new audience (everyone, or a single circle). */
export async function setSignalsAudience(
  circleId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await requireUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const { error } = await supabase
    .from('availability_signals')
    .update({ circle_id: circleId })
    .eq('user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true };
}

/** Turn every signal off at once. */
export async function clearSignal(): Promise<{ ok: boolean; error?: string }> {
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
