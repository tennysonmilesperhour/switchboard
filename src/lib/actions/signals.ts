'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_DURATION_HOURS = 3;

export async function setSignal(
  emoji: string,
  label: string,
  circleId: string | null,
  durationHours: number = DEFAULT_DURATION_HOURS,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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

  // One live signal at a time keeps the surface calm.
  await supabase.from('availability_signals').delete().eq('user_id', user.id);

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

export async function clearSignal(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('availability_signals').delete().eq('user_id', user.id);
  revalidatePath('/');
}
