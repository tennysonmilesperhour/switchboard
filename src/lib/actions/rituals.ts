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

  // A sabbatical pauses rituals both ways (D6). The insert policy refuses it
  // too; asking first turns that refusal into a sentence instead of a code.
  const { data: away } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [user.id, partnerId])
    .eq('sabbatical', true);
  if (away?.some((row) => row.id === user.id)) {
    return validation('Rituals are paused while you’re on sabbatical. End it in Settings to start one.');
  }
  const partnerAway = away?.find((row) => row.id === partnerId);
  if (partnerAway) {
    return validation(
      `${partnerAway.display_name || 'Your friend'} is on sabbatical right now. Try again when they’re back.`,
    );
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

/**
 * Skip the ritual that is due (decision D8): the due date moves one cadence
 * ahead, for both people, and nobody is told. `dueOn` names the occurrence
 * being skipped, so a double tap, or both people skipping at once, moves it
 * once. The database checks the caller is one of the two (`skip_ritual`).
 */
export async function skipRitual(ritualId: string, dueOn: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueOn)) return validation('That ritual date isn’t valid.');

  const { data: outcome, error } = await auth.supabase.rpc('skip_ritual', {
    p_ritual: ritualId,
    p_due_on: dueOn,
  });
  if (error) return reportAndFail('SB-RITUAL-SAVE', 'ritual.skip', error, { ritualId });

  switch (outcome) {
    case 'skipped':
      revalidatePath('/mutual');
      revalidatePath('/');
      return { ok: true };
    case 'already_moved':
      revalidatePath('/mutual');
      revalidatePath('/');
      return validation('That one was already skipped or planned, so nothing else changed.');
    case 'not_due':
      return validation('That ritual isn’t due yet, so there’s nothing to skip.');
    case 'not_active':
      return validation('That ritual is paused or ended, so there’s nothing to skip.');
    default:
      return validation('That ritual isn’t one of yours any more.');
  }
}
