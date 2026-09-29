'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { notifyUsers } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

export async function proposeRitual(
  partnerId: string,
  activity: string,
  cadenceDays: number,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanActivity = activity.trim().slice(0, 80);
  if (!cleanActivity) return validation('Name the ritual first.');

  if (!(await checkRateLimit(`ritual:${user.id}`, 20, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve sent a lot of proposals. Try again later.');
  }

  const { error } = await supabase.from('rituals').insert({
    creator_id: user.id,
    partner_id: partnerId,
    activity: cleanActivity,
    cadence_days: cadenceDays,
  });
  if (error) return reportAndFail('SB-RITUAL-SAVE', 'ritual.create', error, { partnerId });

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
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  // Only the invited partner may accept/decline - the proposer cannot
  // self-accept their own proposal.
  const { data: updated, error } = await supabase
    .from('rituals')
    .update({ status: accept ? 'active' : 'ended' })
    .eq('id', ritualId)
    .eq('status', 'proposed')
    .eq('partner_id', user.id)
    .select('creator_id, activity');
  if (error) return reportAndFail('SB-RITUAL-SAVE', 'ritual.update', error, { ritualId });
  // Zero rows is not a success: it was already answered, or they called it
  // off first. Saying "done" left the card on screen doing nothing.
  const ritual = updated?.[0];
  if (!ritual) return validation('That ritual was already answered or called off.');

  // The proposer was told "waiting on them" and never heard the answer. A yes
  // is worth telling them; a no stays quiet, like every other no here.
  if (accept) {
    const { data: me } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle();
    await notifyUsers([ritual.creator_id], {
      kind: 'ritual',
      title: 'It’s a ritual 🔁',
      body: `${me?.display_name ?? 'Your friend'} is in for "${ritual.activity}" as a regular thing.`,
      url: '/mutual',
    });
  }
  revalidatePath('/mutual');
  revalidatePath('/');
  return { ok: true };
}

export async function pauseRitual(ritualId: string, pause: boolean): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from('rituals')
    .update({ status: pause ? 'paused' : 'active' })
    .eq('id', ritualId);
  if (error) return reportAndFail('SB-RITUAL-SAVE', 'ritual.update', error, { ritualId });
  revalidatePath('/mutual');
  revalidatePath('/');
  return { ok: true };
}

export async function endRitual(ritualId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase
    .from('rituals')
    .update({ status: 'ended' })
    .eq('id', ritualId);
  if (error) return reportAndFail('SB-RITUAL-SAVE', 'ritual.update', error, { ritualId });
  revalidatePath('/mutual');
  revalidatePath('/');
  return { ok: true };
}
