'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { sendPushToUsers } from '@/lib/server/notify';
import type { IntentKind } from '@/lib/types';

export interface MutualResult {
  ok: boolean;
  matched?: boolean;
  error?: string;
}

/**
 * "Down to Connect" - stores private interest. The DB trigger creates a
 * match if (and only if) the interest is mutual; we then notify BOTH
 * people simultaneously so neither is ever "the one who asked".
 */
export async function downToConnect(
  targetId: string,
  activity: string,
  kind: IntentKind = 'down_to_connect',
  eventId: string | null = null,
): Promise<MutualResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in' };

  const { data: intent, error } = await supabase
    .from('mutual_intents')
    .upsert(
      {
        author_id: user.id,
        target_id: targetId,
        activity,
        kind,
        event_id: eventId,
        status: 'active',
      },
      { onConflict: 'author_id,target_id,activity,kind' },
    )
    .select('id')
    .single();
  if (error || !intent) return { ok: false, error: error?.message ?? 'save failed' };

  // The trigger flips both intents to 'matched' when interest is mutual -
  // re-read to observe its result (RETURNING predates the AFTER trigger).
  const { data: after } = await supabase
    .from('mutual_intents')
    .select('status')
    .eq('id', intent.id)
    .single();
  const matched = after?.status === 'matched';
  if (matched) {
    await sendPushToUsers([user.id, targetId], {
      title: '✨ It’s mutual',
      body:
        kind === 'down_to_connect'
          ? `You both want to ${activity.toLowerCase()}. Say hi!`
          : kind === 'discover_connect'
            ? `You both want to connect around ${activity.toLowerCase()}.`
          : 'You’d both rather reschedule - no one has to be the bad guy.',
      url: kind === 'discover_connect' ? '/discover' : '/mutual',
    });

    if (kind === 'open_to_reschedule' && eventId) {
      // Authorization is enforced inside the security-definer function: the
      // caller must participate in the event and hold a matched reschedule
      // intent for it. Never cancel with the admin client from here.
      await supabase.rpc('reschedule_cancel_event', { p_event: eventId });
    }
  }

  revalidatePath('/mutual');
  revalidatePath('/discover');
  return { ok: true, matched };
}

export async function withdrawIntent(intentId: string): Promise<MutualResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('mutual_intents')
    .update({ status: 'withdrawn' })
    .eq('id', intentId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/mutual');
  return { ok: true };
}
