'use server';

import { validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

export async function createHousehold(
  name: string,
  memberIds: string[],
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  const trimmed = name.trim();
  if (!trimmed) return validation('Household needs a name');

  // Only group people you're actually connected to — don't let anyone be
  // silently filed into a household without consent (SB-20).
  let allowed: string[] = [];
  const requested = Array.from(new Set(memberIds)).filter((id) => id && id !== user.id);
  if (requested.length > 0) {
    const { data: connected } = await supabase
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    const connectedIds = new Set(
      (connected ?? []).map((row) =>
        row.requester_id === user.id ? row.addressee_id : row.requester_id,
      ),
    );
    allowed = requested.filter((id) => connectedIds.has(id));
  }

  // Nobody selected is a current connection (e.g. unfriended since the page
  // loaded): an empty household invites nobody, so don't create one.
  if (allowed.length === 0) {
    return validation('Pick at least one person you’re connected to.');
  }

  const { data: household, error } = await supabase
    .from('households')
    .insert({ owner_id: user.id, name: trimmed })
    .select('id')
    .single();
  if (error || !household) {
    return reportAndFail(
      'SB-HOUSEHOLD-SAVE',
      'household.save',
      error ?? new Error('insert returned no household'),
    );
  }

  const { error: membersError } = await supabase.from('household_members').insert(
    allowed.map((memberId) => ({
      household_id: household.id,
      member_id: memberId,
    })),
  );
  // An ignored failure here reported "Household created." for a household with
  // nobody in it. Undo the shell and say it didn't save.
  if (membersError) {
    await supabase.from('households').delete().eq('id', household.id);
    return reportAndFail('SB-HOUSEHOLD-SAVE', 'household.save', membersError, {
      householdId: household.id,
    });
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function deleteHousehold(householdId: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { error } = await auth.supabase.from('households').delete().eq('id', householdId);
  if (error) {
    return reportAndFail('SB-HOUSEHOLD-SAVE', 'household.save', error, { householdId });
  }
  revalidatePath('/people');
  return { ok: true };
}
