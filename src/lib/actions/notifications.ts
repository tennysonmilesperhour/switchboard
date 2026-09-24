'use server';

import type { ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { reportAndFail } from '@/lib/server/observability';

/**
 * Mark every unread notification for this user as read — including ones too old
 * to appear in the visible feed, which previously could keep the badge lit with
 * nothing on screen to acknowledge.
 *
 * The bell counts unread rows in this table and nothing else, so this is
 * guaranteed to darken it. See `NotificationBell` for why that guarantee is
 * worth having.
 */
export async function markAllNotificationsRead(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) return reportAndFail('SB-NOTIFY-SAVE', 'notification.read-all', error);

  // The bell badge renders in the shared shell on every page.
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Empty the feed: delete every notification this user has.
 *
 * "Mark all as read" leaves a screen full of items that have already been dealt
 * with, and people reach for a way to clear them — so there is one, and it does
 * what the words say rather than only greying things out. Nothing is lost that
 * only lived here: a notification is the announcement of something, and the
 * something (the plan, the request, the message) stays on its own screen.
 *
 * Deletes through the session client, so the `notifications_delete` policy
 * (`user_id = auth.uid()`) is what scopes it — never the filter below alone.
 */
export async function clearNotifications(): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('user_id', user.id);
  if (error) return reportAndFail('SB-NOTIFY-CLEAR', 'notification.clear', error);

  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Mark one notification read — fired when the user opens or taps it. */
export async function markNotificationRead(id: string): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('read_at', null);
  if (error) return reportAndFail('SB-NOTIFY-SAVE', 'notification.read', error, { id });

  revalidatePath('/', 'layout');
  return { ok: true };
}
