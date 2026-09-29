'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

export async function proposeIntroduction(
  personA: string,
  personB: string,
  activity: string,
  note: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (personA === personB) return validation('Pick two different friends');

  const cleanActivity = activity.trim().slice(0, 80);
  if (!cleanActivity) return validation('What would they do together?');

  if (!(await checkRateLimit(`matchmaker:${user.id}`, 20, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'You’ve sent a lot of intros. Try again later.');
  }

  // You can only introduce people you're actually connected to — matches the
  // product intent, and stops the endpoint being used to fire push at arbitrary
  // user ids (SB-08).
  const [{ data: connA }, { data: connB }] = await Promise.all([
    supabase.rpc('is_connected_with', { p_other: personA }),
    supabase.rpc('is_connected_with', { p_other: personB }),
  ]);
  if (!connA || !connB) {
    return failure(
      'SB-PERM-DENIED',
      'You can only introduce people you’re connected to.',
    );
  }

  // Don't propose anyone who's taking a quiet season.
  const { data: resting } = await supabase
    .from('profiles')
    .select('id')
    .in('id', [personA, personB])
    .eq('sabbatical', true);
  if (resting && resting.length > 0) {
    return validation('One of them is on a sabbatical right now.');
  }

  const { error } = await supabase.from('matchmaker_proposals').insert({
    proposer_id: user.id,
    person_a: personA,
    person_b: personB,
    activity: cleanActivity,
    note: note.trim().slice(0, 280) || null,
  });
  if (error) {
    return reportAndFail('SB-INTRO-SAVE', 'intro.create', error, { personA, personB });
  }

  // Recorded, not push-only: someone who never enabled push (or was in quiet
  // hours) otherwise heard nothing and could only stumble on the Home card.
  // Names nobody, so the durable row reveals no more than the push did.
  await notifyUsers([personA, personB], {
    kind: 'match',
    title: 'A friend thinks you two would hit it off',
    body: `Someone you both know suggested ${cleanActivity.toLowerCase()}. Only revealed if you both say yes.`,
    url: '/',
  });
  revalidatePath('/people');
  return { ok: true };
}

export async function respondToIntroduction(
  proposalId: string,
  accept: boolean,
): Promise<ActionResult & { matched: boolean }> {
  const auth = await requireUser();
  if (!auth.ok) return { ...auth, matched: false };
  const { supabase } = auth;
  const { data, error } = await supabase.rpc('respond_to_matchmaker', {
    p_proposal: proposalId,
    p_accept: accept,
  });
  if (error) {
    return {
      ...(await reportAndFail('SB-INTRO-SAVE', 'intro.create', error, { proposalId })),
      matched: false,
    };
  }

  const matched = data === 'matched';
  if (matched) {
    // Both said yes — identities are revealed, so tell both. Previously a
    // match notified nobody and the whole payoff was silent.
    const admin = createAdminClient();
    const { data: proposal } = await admin
      .from('matchmaker_proposals')
      .select('person_a, person_b, activity, room_id')
      .eq('id', proposalId)
      .maybeSingle();
    if (proposal?.person_a && proposal?.person_b) {
      const activity = proposal.activity ? String(proposal.activity).toLowerCase() : null;
      await notifyUsers([proposal.person_a, proposal.person_b], {
        kind: 'match',
        title: '✨ It’s a match',
        body: activity ? `You both said yes to ${activity}. Say hi!` : 'You both said yes. Say hi!',
        // "Say hi" has to land somewhere you can. It pointed at /people, which
        // lists connections, and the two of you are not connected: the match
        // was on no part of that page.
        url: proposal.room_id ? `/rooms/${proposal.room_id}` : '/mutual',
      });
    }
  }
  revalidatePath('/');
  return { ok: true, matched };
}
