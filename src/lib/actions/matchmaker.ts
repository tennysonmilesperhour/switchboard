'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUsers } from '@/lib/server/notify';

export async function proposeIntroduction(
  personA: string,
  personB: string,
  activity: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (personA === personB) return { ok: false, error: 'Pick two different friends' };

  const { error } = await supabase.from('matchmaker_proposals').insert({
    proposer_id: user.id,
    person_a: personA,
    person_b: personB,
    activity,
    note: note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  await sendPushToUsers([personA, personB], {
    title: 'A friend thinks you two would hit it off',
    body: `Someone you both know suggested ${activity.toLowerCase()}. Only revealed if you both say yes.`,
    url: '/',
  });
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
  revalidatePath('/');
  return { ok: true, matched };
}
