'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';

export async function claimVenue(
  name: string,
  area: string,
  perk: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!name.trim() || !perk.trim()) {
    return { ok: false, error: 'Name and perk are required' };
  }

  const { error } = await supabase.from('venues').insert({
    name: name.trim(),
    area: area.trim() || null,
    perk: perk.trim(),
    claimed_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/discover');
  return { ok: true };
}
