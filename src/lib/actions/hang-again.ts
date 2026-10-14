'use server';

import { failure, validation, type ActionResult } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { notifyUsers } from '@/lib/server/notify';
import { reportAndFail } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Would you hang out with them again?" after a finished plan
 * (docs/research/timeleft-onboarding.md, R7).
 *
 * The rule lives in `answer_hang_again`: both people must have been at the
 * plan, the plan must be over, and neither may have blocked the other. A yes
 * is private until the other person says yes too; then both hear at once and
 * share a match room, like every other mutual path. A no is never shown.
 */
export async function answerHangAgain(
  eventId: string,
  targetId: string,
  yes: boolean,
): Promise<ActionResult & { matched?: boolean; url?: string }> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;
  if (!UUID.test(eventId) || !UUID.test(targetId) || targetId === user.id) {
    return validation('That didn’t make sense.');
  }

  const { data, error } = await supabase.rpc('answer_hang_again', {
    p_event: eventId,
    p_target: targetId,
    p_yes: yes === true,
  });
  if (error) {
    // Refused: not at the plan, not over, or a block. One answer for all of
    // them, so the refusal reveals nothing about the other person.
    if (error.code === '42501') return failure('SB-HANG-SAVE');
    return reportAndFail('SB-HANG-SAVE', 'hang-again.answer', error, { eventId });
  }

  revalidatePath('/');
  if (data !== 'matched') return { ok: true, matched: false };

  // The definer just matched the caller with this person, so the match row is
  // readable to the caller under matches_select.
  const { data: match } = await supabase
    .from('matches')
    .select('room_id')
    .eq('kind', 'hang_again')
    // Both ids are validated uuids, so they cannot carry filter syntax.
    .or(
      `and(user_a.eq.${user.id},user_b.eq.${targetId}),and(user_a.eq.${targetId},user_b.eq.${user.id})`,
    )
    .limit(1)
    .maybeSingle();
  const url = match?.room_id ? `/rooms/${match.room_id}` : '/mutual';
  await notifyUsers([user.id, targetId], {
    kind: 'match',
    title: 'You both want to hang out again',
    body: 'You each said yes after your last plan together. Say hi!',
    url,
  });
  revalidatePath('/mutual');
  return { ok: true, matched: true, url };
}
