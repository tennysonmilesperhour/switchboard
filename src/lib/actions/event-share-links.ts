'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager } from '@/lib/server/authz';
import { reportAndFail } from '@/lib/server/observability';
import type { ActionResult } from '@/lib/errors';
import { failure } from '@/lib/errors';

/**
 * Turn the plan's public share link on or off.
 *
 * This is the kill switch for `/i/<share_token>` — the link a host texts to
 * people who aren't on the plan yet. It is separate from `open_table` (which
 * governs the older ask-to-join flow) and defaults to ON in the database, not in
 * a client `useState`: the previous "default invite links to on" fix only
 * changed the creation wizard's initial state, so every plan created any other
 * way (cloned, recurring, ritual) kept a dead link.
 */
export async function setEventShareLink(
  eventId: string,
  active: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can change this.');
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('events')
    .update({ share_link_active: active })
    .eq('id', eventId);
  if (error) {
    return reportAndFail(
      'SB-SHARE-SAVE',
      'event-share-link',
      error,
      { eventId },
      'Could not update the invite link. Try again.',
    );
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}

/**
 * Mint a fresh share token, invalidating any link already sent. Host/co-host
 * only — enforced inside the security-definer function, which is why the
 * caller id is passed explicitly (auth.uid() is null under the service role).
 */
export async function rotateEventShareLink(
  eventId: string,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return failure('SB-PERM-HOST', 'Only the host can change this.');
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc('rotate_event_share_token', {
    p_event: eventId,
    p_user: user.id,
  });
  if (error) {
    return reportAndFail(
      'SB-SHARE-SAVE',
      'event-share-link-rotate',
      error,
      { eventId },
      'Could not refresh the invite link. Try again.',
    );
  }

  revalidatePath(`/events/${eventId}`);
  return { ok: true };
}
