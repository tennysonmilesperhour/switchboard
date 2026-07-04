'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type Feeling = 'filled' | 'neutral' | 'drained';

/** Strictly private one-tap reflection after an event. */
export async function logEnergy(
  eventId: string,
  feeling: Feeling,
): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from('energy_logs').upsert({
    user_id: user.id,
    event_id: eventId,
    feeling,
  });
  revalidatePath('/');
  return { ok: !error };
}
