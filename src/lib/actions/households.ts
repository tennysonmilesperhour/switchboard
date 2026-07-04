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

  const { data: household, error } = await supabase
    .from('households')
    .insert({ owner_id: user.id, name: trimmed })
    .select('id')
    .single();
  if (error || !household) return { ok: false, error: error?.message };

  if (memberIds.length > 0) {
    await supabase.from('household_members').insert(
      memberIds.map((memberId) => ({
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
