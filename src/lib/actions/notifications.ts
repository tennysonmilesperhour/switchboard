'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';

/**
 * Clear the bell: mark every unread notification for this user as read —
 * including ones too old to appear in the visible feed, which previously
 * could keep the badge lit with nothing on screen to acknowledge.
 */
export async function markAllNotificationsRead(): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) return { ok: false, error: 'Could not mark notifications read. Try again.' };

  // The bell badge renders in the shared shell on every page.
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Mark one notification read — fired when the user opens or taps it. */
export async function markNotificationRead(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) return { ok: false, error: 'Could not update that notification.' };

  revalidatePath('/', 'layout');
  return { ok: true };
}
