'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/server/require-user';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkEventManager } from '@/lib/server/authz';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import type { ActionResult } from '@/lib/errors';
import { failure } from '@/lib/errors';

/**
 * Turn the shareable invite link on or off. Enabling marks the plan an "open
 * table" so anyone the host sends the link to can ask to join (the host still
 * approves each request, via the existing join-requests panel); disabling stops
 * new link requests. Host/co-host only — the same authorization gate every other
 * management action uses. Writes through the service-role client after that
 * check, mirroring updateEventDetails/confirmEvent; `open_table` is a plain,
 * non-sensitive flag (no role/rank/ownership state), so there is no new
 * self-writable trust surface here.
 */
export async function setEventInviteLink(
  eventId: string,
  enabled: boolean,
): Promise<ActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const manager = await checkEventManager(user.id, eventId);
  if (!manager.ok) return failure('SB-PLAN-AUTHZ');
  if (!manager.isManager) {
    return { ok: false, error: 'Only the host can change this.' };
  }

  const admin = createAdminClient();
  const { data: event } = await admin
    .from('events')
    .select('status')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Plan not found.' };
  if (event.status === 'cancelled' || event.status === 'past') {
    return { ok: false, error: 'This plan is closed.' };
  }

  const { error } = await admin
    .from('events')
    .update({ open_table: enabled })
    .eq('id', eventId);
  if (error) {
    await reportOperationalError('event-invite-link', error, { eventId });
    return { ok: false, error: 'Could not update the invite link. Try again.' };
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath('/discover');
  return { ok: true };
}

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
    return { ok: false, error: 'Only the host can change this.' };
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
    return { ok: false, error: 'Only the host can change this.' };
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
