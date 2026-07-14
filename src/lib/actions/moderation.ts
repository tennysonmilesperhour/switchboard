'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';

/**
 * Resolve or dismiss a user report. Authorization is enforced in the database:
 * resolve_report() is a security-definer function that self-checks
 * is_platform_moderator(auth.uid()) and raises for anyone else, so this action
 * can safely run under the caller's RLS client.
 */
export async function resolveReport(
  reportId: string,
  status: 'resolved' | 'dismissed',
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  const { error } = await supabase.rpc('resolve_report', {
    p_report: reportId,
    p_status: status,
    p_note: note.trim() || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/moderation');
  return { ok: true };
}
