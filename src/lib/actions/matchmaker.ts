'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers, sendPushToUsers } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/require-user';

export async function proposeIntroduction(
  personA: string,
  personB: string,
  activity: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (personA === personB) return { ok: false, error: 'Pick two different friends' };

  const cleanActivity = activity.trim().slice(0, 80);
  if (!cleanActivity) return { ok: false, error: 'What would they do together?' };

  if (!(await checkRateLimit(`matchmaker:${user.id}`, 20, 60 * 60))) {
    return { ok: false, error: 'You’ve sent a lot of intros. Try again later.' };
  }

  // You can only introduce people you're actually connected to — matches the
  // product intent, and stops the endpoint being used to fire push at arbitrary
  // user ids (SB-08).
  const [{ data: connA }, { data: connB }] = await Promise.all([
    supabase.rpc('are_connected', { a: user.id, b: personA }),
    supabase.rpc('are_connected', { a: user.id, b: personB }),
  ]);
  if (!connA || !connB) {
    return { ok: false, error: 'You can only introduce people you’re connected to.' };
  }

  // Don't propose anyone who's taking a quiet season.
  const { data: resting } = await supabase
    .from('profiles')
    .select('id')
    .in('id', [personA, personB])
    .eq('sabbatical', true);
  if (resting && resting.length > 0) {
    return { ok: false, error: 'One of them is on a sabbatical right now.' };
  }

  const { error } = await supabase.from('matchmaker_proposals').insert({
    proposer_id: user.id,
    person_a: personA,
    person_b: personB,
    activity: cleanActivity,
    note: note.trim().slice(0, 280) || null,
  });
  if (error) return { ok: false, error: error.message };

  await sendPushToUsers(
    [personA, personB],
    {
      title: 'A friend thinks you two would hit it off',
      body: `Someone you both know suggested ${cleanActivity.toLowerCase()}. Only revealed if you both say yes.`,
      url: '/',
    },
    'social',
  );
  revalidatePath('/people');
  return { ok: true };
}

export async function respondToIntroduction(
  proposalId: string,
  accept: boolean,
): Promise<{ ok: boolean; matched: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('respond_to_matchmaker', {
    p_proposal: proposalId,
    p_accept: accept,
  });
  if (error) return { ok: false, matched: false, error: error.message };

  const matched = data === 'matched';
  if (matched) {
    // Both said yes — identities are revealed, so tell both. Previously a
    // match notified nobody and the whole payoff was silent.
    const admin = createAdminClient();
    const { data: proposal } = await admin
      .from('matchmaker_proposals')
      .select('person_a, person_b, activity')
      .eq('id', proposalId)
      .maybeSingle();
    if (proposal?.person_a && proposal?.person_b) {
      const activity = proposal.activity ? String(proposal.activity).toLowerCase() : null;
      await notifyUsers([proposal.person_a, proposal.person_b], {
        kind: 'match',
        title: '✨ It’s a match',
        body: activity ? `You both said yes to ${activity}. Say hi!` : 'You both said yes. Say hi!',
        url: '/people',
      });
    }
  }
  revalidatePath('/');
  return { ok: true, matched };
}
