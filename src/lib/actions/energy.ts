'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/errors';
import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';

export type Feeling = 'filled' | 'neutral' | 'drained';

/** Strictly private one-tap reflection after an event. */
export async function logEnergy(
  eventId: string,
  feeling: Feeling,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase.from('energy_logs').upsert({
    user_id: user.id,
    event_id: eventId,
    feeling,
  });
  if (error) return reportAndFail('SB-ENERGY-SAVE', 'energy.save', error, { eventId });
  revalidatePath('/');
  return { ok: true };
}
