'use server';

import type { ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';

/**
 * Submit a venue claim. The row is born `pending` (the venues_insert policy pins
 * it) and only becomes publicly visible once a platform moderator verifies it —
 * so this is a *submission for review*, not an instant listing. Capturing the
 * business URL gives the moderator something to verify the claim against.
 */
export async function claimVenue(
  name: string,
  area: string,
  perk: string,
  url: string,
): Promise<ActionResult> {
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
    url: url.trim() || null,
    claimed_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/discover');
  return { ok: true };
}

/**
 * Verify or reject a pending venue claim. Authorization is enforced in the
 * database: review_venue() delegates to a security-definer body that self-checks
 * is_platform_moderator(auth.uid()) and raises for anyone else, and the freeze
 * trigger independently blocks non-moderators from moving `status` — so this can
 * safely run under the caller's RLS client (mirrors resolveReport).
 */
export async function reviewVenue(
  venueId: string,
  decision: 'verified' | 'rejected',
  note: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { error } = await supabase.rpc('review_venue', {
    p_venue: venueId,
    p_decision: decision,
    p_note: note.trim() || undefined,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/moderation');
  revalidatePath('/discover');
  return { ok: true };
}
