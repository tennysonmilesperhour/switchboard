'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function createHousehold(
  name: string,
  memberIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Household needs a name' };

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

  const { data: household, error } = await supabase
    .from('households')
    .insert({ owner_id: user.id, name: trimmed })
    .select('id')
    .single();
  if (error || !household) return { ok: false, error: error?.message };

  if (allowed.length > 0) {
    await supabase.from('household_members').insert(
      allowed.map((memberId) => ({
        household_id: household.id,
        member_id: memberId,
      })),
    );
  }
  revalidatePath('/people');
  return { ok: true };
}

export async function deleteHousehold(householdId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('households').delete().eq('id', householdId);
  revalidatePath('/people');
}
