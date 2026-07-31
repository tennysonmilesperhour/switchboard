'use server';

import type { ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { notifyUsers } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/require-user';

export async function proposeRitual(
  partnerId: string,
  activity: string,
  cadenceDays: number,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanActivity = activity.trim().slice(0, 80);
  if (!cleanActivity) return { ok: false, error: 'Name the ritual first.' };

  if (!(await checkRateLimit(`ritual:${user.id}`, 20, 60 * 60))) {
    return { ok: false, error: 'You’ve sent a lot of proposals. Try again later.' };
  }

  const { error } = await supabase.from('rituals').insert({
    creator_id: user.id,
    partner_id: partnerId,
    activity: cleanActivity,
    cadence_days: cadenceDays,
  });
  if (error) return { ok: false, error: error.message };

  await notifyUsers([partnerId], {
    kind: 'ritual',
    title: 'A standing ritual, proposed',
    body: `Someone wants to make "${cleanActivity}" a regular thing with you.`,
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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Only the invited partner may accept/decline - the proposer cannot
  // self-accept their own proposal.
  await supabase
    .from('rituals')
    .update({ status: accept ? 'active' : 'ended' })
    .eq('id', ritualId)
    .eq('status', 'proposed')
    .eq('partner_id', user.id);
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
