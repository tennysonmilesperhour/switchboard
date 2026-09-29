'use server';

import { validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import type { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

type ServerClient = Awaited<ReturnType<typeof createClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Everyone the caller has an accepted connection with, read through RLS. */
async function connectionIdsOf(supabase: ServerClient, userId: string): Promise<Set<string>> {
  if (!UUID_RE.test(userId)) return new Set();
  const { data: connected } = await supabase
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  return new Set(
    (connected ?? []).map((row) =>
      row.requester_id === userId ? row.addressee_id : row.requester_id,
    ),
  );
}

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
  // silently filed into a household without consent (SB-20). The database
  // holds the same line (household_members_owner), so this is for the message.
  const requested = Array.from(new Set(memberIds)).filter((id) => id && id !== user.id);
  const connectedIds = await connectionIdsOf(supabase, user.id);
  const allowed = requested.filter((id) => connectedIds.has(id));

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

/**
 * Change who is in a household after it was made (P9).
 *
 * Picking the household in the invite picker selects everyone in it; picking
 * one of them alone does not (D9). So the set has to be editable — a household
 * frozen at creation meant deleting and rebuilding it every time someone moved
 * out. Additions must be your connections (the database enforces it too);
 * removals are always allowed, including of someone you are no longer
 * connected to. An empty household invites nobody, so the last person can't be
 * removed — delete the household instead.
 */
export async function updateHouseholdMembers(
  householdId: string,
  memberIds: string[],
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID_RE.test(householdId)) return validation('That household is no longer here.');

  // RLS already limits this to the owner's households; the explicit owner
  // filter turns someone else's id into a clear message instead of a no-op.
  const { data: household } = await supabase
    .from('households')
    .select('id, household_members(member_id)')
    .eq('id', householdId)
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!household) return validation('That household is no longer here.');

  const current = new Set((household.household_members ?? []).map((row) => row.member_id));
  const wanted = new Set(
    Array.from(new Set(memberIds)).filter((id) => UUID_RE.test(id) && id !== user.id),
  );
  const toRemove = [...current].filter((id) => !wanted.has(id));
  const requestedAdds = [...wanted].filter((id) => !current.has(id));

  const connectedIds = requestedAdds.length
    ? await connectionIdsOf(supabase, user.id)
    : new Set<string>();
  const toAdd = requestedAdds.filter((id) => connectedIds.has(id));
  const finalCount = current.size - toRemove.length + toAdd.length;
  if (finalCount === 0) {
    return validation('A household needs at least one person. Delete it instead if you don’t need it.');
  }
  if (toAdd.length === 0 && toRemove.length === 0) {
    return requestedAdds.length > 0
      ? validation('You can only add people you’re connected to.')
      : { ok: true };
  }

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from('household_members')
      .insert(toAdd.map((memberId) => ({ household_id: householdId, member_id: memberId })));
    if (error) {
      return reportAndFail('SB-HOUSEHOLD-SAVE', 'household.members', error, { householdId });
    }
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('household_members')
      .delete()
      .eq('household_id', householdId)
      .in('member_id', toRemove);
    if (error) {
      return reportAndFail('SB-HOUSEHOLD-SAVE', 'household.members', error, { householdId });
    }
  }

  revalidatePath('/people');
  revalidatePath('/events/new');
  return { ok: true };
}
