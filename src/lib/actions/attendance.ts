'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Still coming?" in the 36 hours before an Open Table
 * (docs/research/timeleft-onboarding.md, idea 6).
 *
 * `confirm_attendance` decides everything: whose seat it is, whether the
 * window is open, and who takes a seat given back. This action only tells the
 * people involved. The id of whoever took the seat never leaves the server.
 */
export async function confirmAttendance(
  inviteId: string,
  coming: boolean,
): Promise<ActionResult & { outcome?: 'confirmed' | 'released' }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  if (!UUID.test(inviteId)) return validation('That didn’t make sense.');

  const { data, error } = await supabase.rpc('confirm_attendance', {
    p_invite: inviteId,
    p_coming: coming === true,
  });
  if (error) {
    // The window closed, or the seat is no longer this person's to answer for.
    if (error.code === '42501') return failure('SB-SEAT-SAVE');
    return reportAndFail('SB-SEAT-SAVE', 'attendance.confirm', error, { inviteId });
  }
  const row = data?.[0];
  revalidatePath('/');
  if (row?.outcome !== 'released') return { ok: true, outcome: 'confirmed' };

  // The definer just declined this caller's own seat, which is what
  // authorizes these service-role reads of that invite and its plan.
  const admin = createAdminClient();
  const { data: invite } = await admin
    .from('invites')
    .select('event_id, event:events(id, title, host_id)')
    .eq('id', inviteId)
    .maybeSingle();
  const event = Array.isArray(invite?.event) ? invite?.event[0] : invite?.event;
  if (event) {
    const promoted = row.promoted_invite;
    await notifyUsers([event.host_id], {
      kind: 'seat_released',
      title: 'A seat opened up',
      body: promoted
        ? `A guest can’t make it to ${event.title}. The next person waiting has their seat.`
        : `A guest can’t make it to ${event.title}, and nobody was waiting.`,
      url: `/events/${event.id}`,
    });
    if (promoted) {
      const { data: next, error: nextError } = await admin
        .from('invites')
        .select('invitee_id')
        .eq('id', promoted)
        .maybeSingle();
      if (nextError) {
        await reportOperationalError('attendance.confirm', nextError, { inviteId });
      } else if (next?.invitee_id) {
        await notifyUsers([next.invitee_id], {
          kind: 'seat_opened',
          title: 'You’re in',
          body: `A seat opened up at ${event.title}, and it’s yours.`,
          url: `/events/${event.id}`,
        });
      }
    }
    revalidatePath(`/events/${event.id}`);
  }
  revalidatePath('/plans');
  return { ok: true, outcome: 'released' };
}
