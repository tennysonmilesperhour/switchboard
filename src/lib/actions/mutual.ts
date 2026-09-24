'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';

import { revalidatePath } from 'next/cache';
import { notifyInterestReceived, notifyUsers } from '@/lib/server/notify';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/require-user';
import type { IntentKind } from '@/lib/types';
import { reportAndFail } from '@/lib/server/observability';

export interface MutualResult {
  ok: boolean;
  matched?: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
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
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase, user } = auth;

  const cleanActivity = activity.trim().slice(0, 80);
  if (!cleanActivity) return validation('What are you down to do?');

  if (!(await checkRateLimit(`down-to:${user.id}`, 40, 60 * 60))) {
    return failure('SB-RATE-LIMIT', 'Give it a moment before sending more.');
  }

  // Already mutual: say so and write nothing. The upsert below sets `status:
  // 'active'`, so re-sending an interest that had matched flipped the caller's
  // side back to active - which sent the other person a fresh anonymous
  // "someone's interested" for a match they already had, and a tap back from
  // them then matched the pair a second time, with a second room.
  const { data: existing } = await supabase
    .from('mutual_intents')
    .select('status')
    .eq('author_id', user.id)
    .eq('target_id', targetId)
    .eq('activity', cleanActivity)
    .eq('kind', kind)
    .maybeSingle();
  if (existing?.status === 'matched') {
    return { ok: true, matched: true };
  }

  const { data: intent, error } = await supabase
    .from('mutual_intents')
    .upsert(
      {
        author_id: user.id,
        target_id: targetId,
        activity: cleanActivity,
        kind,
        event_id: eventId,
        status: 'active',
      },
      { onConflict: 'author_id,target_id,activity,kind' },
    )
    .select('id')
    .single();
  if (error || !intent) {
    return reportAndFail(
      'SB-MUTUAL-SAVE',
      'mutual.intent',
      error ?? new Error('upsert returned no intent'),
      { targetId, kind },
    );
  }

  // The trigger flips both intents to 'matched' when interest is mutual -
  // re-read to observe its result (RETURNING predates the AFTER trigger).
  const { data: after } = await supabase
    .from('mutual_intents')
    .select('status')
    .eq('id', intent.id)
    .single();
  const matched = after?.status === 'matched';
  if (matched) {
    await notifyUsers([user.id, targetId], {
      kind: 'match',
      title: '✨ It’s mutual',
      body:
        kind === 'down_to_connect'
          ? `You both want to ${cleanActivity.toLowerCase()}. Say hi!`
          : kind === 'discover_connect'
            ? `You both want to connect around ${cleanActivity.toLowerCase()}.`
          : 'You’d both rather reschedule - no one has to be the bad guy.',
      url: kind === 'discover_connect' ? '/discover' : '/mutual',
    });

    if (kind === 'open_to_reschedule' && eventId) {
      // Authorization is enforced inside the security-definer function: the
      // caller must participate in the event and hold a matched reschedule
      // intent for it. Never cancel with the admin client from here.
      await supabase.rpc('reschedule_cancel_event', { p_event: eventId });
    }
  } else if (kind === 'down_to_connect') {
    // One-sided interest, no match yet. Nudge the target ANONYMOUSLY so they
    // know it's worth opening Mutual Mode and picking people back — without
    // ever revealing who, or the activity. The target still can't read the raw
    // intent (RLS), so the anonymity invariant holds; the nudge only fires when
    // the sender is safely hidden in a crowd of connections. Only for
    // down_to_connect: discovery (discover_connect) targets aren't necessarily
    // connections, and reschedule intents are event-scoped, not people-scoped.
    await notifyInterestReceived(targetId);
  }

  revalidatePath('/mutual');
  revalidatePath('/discover');
  return { ok: true, matched };
}

export async function withdrawIntent(intentId: string): Promise<MutualResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = await supabase
    .from('mutual_intents')
    .update({ status: 'withdrawn' })
    .eq('id', intentId);
  if (error) return reportAndFail('SB-MUTUAL-SAVE', 'mutual.respond', error, { intentId });
  revalidatePath('/mutual');
  return { ok: true };
}
