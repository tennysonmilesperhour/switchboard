'use server';

import { validation, type ErrorCode } from '@/lib/errors';
import { isFetchableUrl } from '@/lib/net-guard';
import { reportAndFail } from '@/lib/server/observability';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { requireUser } from '@/lib/server/require-user';

export type ExternalEventActionResult = { ok: boolean; error?: string; code?: ErrorCode };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function setExternalEventPreference(
  eventId: string,
  state: 'saved' | 'hidden' | null,
): Promise<ExternalEventActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!UUID.test(eventId)) return validation('That event is not available.');
  if (!(await checkRateLimit(`external-event-pref:${auth.user.id}`, 120, 60 * 60))) {
    return validation('Too many changes at once. Try again in a bit.');
  }
  const query = auth.supabase.from('external_event_preferences');
  const { error } = state
    ? await query.upsert({ user_id: auth.user.id, event_id: eventId, state }, { onConflict: 'user_id,event_id' })
    : await query.delete().eq('user_id', auth.user.id).eq('event_id', eventId);
  if (error) return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error);
  return { ok: true };
}

export async function submitExternalEventUrl(rawUrl: string, note: string): Promise<ExternalEventActionResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const checked = isFetchableUrl(rawUrl);
  if (!checked.ok) return validation('Add a public http or https event link.');
  if (!(await checkRateLimit(`external-event-submit:${auth.user.id}`, 10, 24 * 60 * 60))) {
    return validation('You’ve sent enough links for today. Try again tomorrow.');
  }
  const cleanNote = note.trim().slice(0, 500);
  const { error } = await auth.supabase.from('external_event_submissions').insert({
    submitted_by: auth.user.id, url: checked.url.toString(), note: cleanNote || null,
  });
  if (error) return reportAndFail('SB-DISCOVERY-SAVE', 'discovery-prefs.save', error);
  return { ok: true };
}
