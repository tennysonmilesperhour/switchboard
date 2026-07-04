'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUsers } from '@/lib/server/notify';

export async function proposeRitual(
  partnerId: string,
  activity: string,
  cadenceDays: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { error } = await supabase.from('rituals').insert({
    creator_id: user.id,
    partner_id: partnerId,
    activity,
    cadence_days: cadenceDays,
  });
  if (error) return { ok: false, error: error.message };

  await sendPushToUsers([partnerId], {
    title: 'A standing ritual, proposed',
    body: `Someone wants to make "${activity}" a regular thing with you.`,
    url: '/mutual',
  });
  revalidatePath('/mutual');
  return { ok: true };
}

export async function respondToRitual(
  ritualId: string,
  accept: boolean,
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('rituals')
    .update({ status: accept ? 'active' : 'ended' })
    .eq('id', ritualId)
    .eq('status', 'proposed');
  revalidatePath('/mutual');
  revalidatePath('/');
}

export async function pauseRitual(ritualId: string, pause: boolean): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('rituals')
    .update({ status: pause ? 'paused' : 'active' })
    .eq('id', ritualId);
  revalidatePath('/mutual');
  revalidatePath('/');
}

export async function endRitual(ritualId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('rituals').update({ status: 'ended' }).eq('id', ritualId);
  revalidatePath('/mutual');
  revalidatePath('/');
}
