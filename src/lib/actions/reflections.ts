'use server';

import { revalidatePath } from 'next/cache';
import { validation, type ActionResult } from '@/lib/errors';
import { reportAndFail, reportOperationalError } from '@/lib/server/observability';
import { requireUser } from '@/lib/server/require-user';
import {
  DECK_VERDICTS,
  JOURNAL_MAX,
  cleanTags,
  impliedFeeling,
  type DeckVerdict,
} from '@/lib/reflection-deck';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Record one swipe on a past plan. Private to the caller; RLS only lets the
 * insert through for a plan they can see, and only ever for themselves.
 */
export async function saveEventReflection(
  eventId: string,
  input: { verdict: DeckVerdict; tags?: string[]; journal?: string },
): Promise<ActionResult> {
  if (!UUID.test(eventId)) return validation('That plan could not be found.');
  if (!DECK_VERDICTS.includes(input.verdict)) return validation('Pick how it went.');
  const journal = (input.journal ?? '').trim();
  if (journal.length > JOURNAL_MAX) {
    return validation(`Keep your journal under ${JOURNAL_MAX} characters.`);
  }

  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const { error } = await supabase.from('event_reflections').upsert({
    user_id: user.id,
    event_id: eventId,
    verdict: input.verdict,
    tags: cleanTags(input.tags),
    journal: journal || null,
  });
  if (error) {
    return reportAndFail('SB-REFLECT-SAVE', 'reflection.save', error, { eventId });
  }

  // Feed the energy map too, but never overwrite a feeling the person logged
  // themselves from Home.
  const feeling = impliedFeeling(input.verdict);
  if (feeling) {
    const { error: energyError } = await supabase
      .from('energy_logs')
      .upsert(
        { user_id: user.id, event_id: eventId, feeling },
        { onConflict: 'user_id,event_id', ignoreDuplicates: true },
      );
    // The reflection itself is saved, so the card is rightly gone; the energy
    // map is derived from it. Log the miss under the same code instead of
    // telling the reader their swipe failed.
    if (energyError) {
      await reportOperationalError('reflection.energy', energyError, { eventId }, 'SB-REFLECT-SAVE');
    }
  }

  revalidatePath('/');
  return { ok: true };
}
