'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function claimVenue(
  name: string,
  area: string,
  perk: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };
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
