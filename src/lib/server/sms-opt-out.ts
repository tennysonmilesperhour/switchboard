import { createAdminClient } from '@/lib/supabase/admin';
import { reportOperationalError } from '@/lib/server/observability';

/** Fail-closed lookup used immediately before every Twilio send. */
export async function smsOptOutStatus(
  normalizedNumber: string,
): Promise<'allowed' | 'opted_out' | 'unavailable'> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('sms_opt_outs')
      .select('normalized_number')
      .eq('normalized_number', normalizedNumber)
      .maybeSingle<{ normalized_number: string }>();
    if (error) throw error;
    return data ? 'opted_out' : 'allowed';
  } catch (error) {
    await reportOperationalError('sms.opt-out-check', error);
    return 'unavailable';
  }
}

/** Idempotently suppress a number after a signed STOP webhook. */
export async function recordSmsOptOut(normalizedNumber: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from('sms_opt_outs').upsert(
    { normalized_number: normalizedNumber, opted_out_at: new Date().toISOString() },
    { onConflict: 'normalized_number' },
  );
  if (error) throw error;
}

/** Idempotently restore sending after a signed START webhook. */
export async function clearSmsOptOut(normalizedNumber: string): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('sms_opt_outs')
    .delete()
    .eq('normalized_number', normalizedNumber);
  if (error) throw error;
}

/**
 * Follow-up texts are allowed only for guests whose invitation itself was
 * successfully dispatched by SMS. A phone-shaped contact is not consent.
 */
export async function inviteIdsSentBySms(inviteIds: string[]): Promise<Set<string>> {
  if (inviteIds.length === 0) return new Set();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from('invite_delivery_attempts')
      .select('invite_id')
      .in('invite_id', inviteIds)
      .eq('channel', 'sms')
      .eq('status', 'sent');
    if (error) throw error;
    return new Set((data ?? []).map((row) => row.invite_id as string));
  } catch (error) {
    await reportOperationalError('sms.consent-check', error, { inviteCount: inviteIds.length });
    return new Set();
  }
}
