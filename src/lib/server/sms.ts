import 'server-only';

import { reportOperationalError } from '@/lib/server/observability';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { appUrl, type ProviderDeliveryResult } from '@/lib/server/email';
import { normalizePhoneNumber, looksLikePhoneNumber } from '@/lib/phone';
import { mapInBatches } from '@/lib/server/batches';
import { smsConsentAllows, smsBudgetAllows } from '@/lib/server/sms-policy';
import { absoluteUrl } from '@/lib/links';
import { smsOptOutStatus } from '@/lib/server/sms-opt-out';

export const PROVIDER_TIMEOUT_MS = 10_000;

export interface SmsMessage {
  to: string;
  body: string;
  category?: 'plans' | 'reminders' | 'verification';
  jobId?: string;
  recipientUserId?: string;
  expiresAt?: string;
  guestInviteId?: string;
  urgentUntil?: string;
}

export { looksLikePhoneNumber, normalizePhoneNumber };

export function smsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim()
      && process.env.TWILIO_AUTH_TOKEN?.trim()
      && (
        process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()
        || normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER)
      ),
  );
}

export async function sendSms(message: SmsMessage): Promise<boolean> {
  return (await sendSmsWithResult(message)).status === 'sent';
}

/** Persist a receipt before the provider call; never persist verification bodies. */
export async function sendSmsWithResult(message: SmsMessage): Promise<ProviderDeliveryResult> {
  if (message.jobId || !normalizePhoneNumber(message.to) || !smsEnabled()) return dispatchSms(message);
  const admin = createAdminClient();
  const id = randomUUID();
  const { error } = await admin.from('sms_jobs').insert({ id, phone: normalizePhoneNumber(message.to)!, category: message.category ?? 'plans', status: 'sending', attempts: 1, body: null });
  if (error) return { status: 'failed', provider: 'twilio', errorCode: 'receipt_unavailable' };
  const result = await dispatchSms({ ...message, jobId: id });
  const uncertain = ['timeout','network_error','invalid_response'].includes(result.errorCode ?? '');
  const { error: writeError } = await admin.from('sms_jobs').update({
    status: result.status === 'sent' ? 'accepted' : uncertain ? 'unknown' : 'failed',
    provider_message_id: result.providerMessageId ?? null, error_code: result.errorCode ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('status', 'sending');
  if (writeError) console.error('[sms:receipt]', { errorCode: 'receipt_write_failed', jobId: id });
  if (result.status === 'failed') await reportOperationalError('sms.delivery', new Error('SMS request failed'), { errorCode: result.errorCode ?? null, jobId: id });
  return result;
}

/** Send one SMS and return an operator-safe outcome for delivery tracking. */
async function dispatchSms(
  message: SmsMessage,
): Promise<ProviderDeliveryResult> {
  const to = normalizePhoneNumber(message.to);
  if (!to) return { status: 'invalid_recipient', provider: 'twilio' };
  if (!smsEnabled()) {
    console.info('[sms:skipped] provider is not configured');
    return { status: 'not_configured', provider: 'twilio' };
  }

  const permission = await smsOptOutStatus(to);
  if (permission === 'opted_out') {
    return { status: 'opted_out', provider: 'twilio' };
  }
  if (permission === 'unavailable') {
    return {
      status: 'failed',
      provider: 'twilio',
      errorCode: 'opt_out_check_failed',
    };
  }

  if (process.env.SMS_PAUSED === 'true') return { status: 'not_configured', provider: 'twilio', errorCode: 'sms_paused' };
  const prefixes = (process.env.SMS_ALLOWED_PREFIXES ?? '+1').split(',').map(value => value.trim()).filter(value => /^\+\d{1,4}$/.test(value));
  if (!prefixes.some(prefix => to.startsWith(prefix))) return { status: 'invalid_recipient', provider: 'twilio', errorCode: 'destination_not_allowed' };
  if (message.body.length > 450) return { status: 'failed', provider: 'twilio', errorCode: 'message_too_long' };
  if (message.category !== 'verification' && !(await smsConsentAllows(to, message.category ?? 'plans', message.recipientUserId, message.guestInviteId, message.urgentUntil))) {
    return { status: 'opted_out', provider: 'twilio', errorCode: 'consent_required' };
  }
  if (!(await smsBudgetAllows(to))) return { status: 'failed', provider: 'twilio', errorCode: 'sms_budget' };

  const accountSid = process.env.TWILIO_ACCOUNT_SID!.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN!.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const from = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER);
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const remainingSeconds = message.expiresAt ? Math.floor((Date.parse(message.expiresAt) - Date.now()) / 1000) : Infinity;
  if (remainingSeconds <= 0 || Number.isNaN(remainingSeconds)) return { status: 'failed', provider: 'twilio', errorCode: 'message_expired' };
  const form = new URLSearchParams({
    To: to,
    Body: message.body,
    ValidityPeriod: String(Math.min(message.category === 'verification' ? 600 : 900, remainingSeconds)),
  });
  if (messagingServiceSid) {
    form.set('MessagingServiceSid', messagingServiceSid);
  } else if (from) {
    form.set('From', from);
  }

  if (message.jobId) form.set('StatusCallback', absoluteUrl(`/api/sms/status?id=${message.jobId}`));

  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    const body = await response.json().catch(() => null) as
      | { sid?: unknown; code?: unknown; error_code?: unknown; status?: unknown }
      | null;
    // Preserve Twilio's diagnostic code, never its message (which may contain
    // the recipient or other private data). HTTP 201 only means accepted.
    const rawCode = body?.error_code ?? body?.code;
    const providerCode = /^(?:[1-9]\d{3,5})$/.test(String(rawCode))
      ? String(rawCode)
      : null;
    if (!response.ok || providerCode || body?.status === 'failed' || body?.status === 'undelivered') {
      const errorCode = providerCode ? `twilio_${providerCode}` : `http_${response.status}`;
      console.error('[sms:failed]', { httpStatus: response.status, errorCode });
      return {
        status: providerCode === '21610' ? 'opted_out' : 'failed',
        provider: 'twilio',
        errorCode,
      };
    }
    if (typeof body?.sid !== 'string' || !body.sid.startsWith('SM')) {
      return { status: 'failed', provider: 'twilio', errorCode: 'invalid_response' };
    }
    return {
      status: 'sent',
      provider: 'twilio',
      providerMessageId: typeof body?.sid === 'string' ? body.sid : undefined,
    };
  } catch {
    console.error('[sms:error]', { errorCode: signal.aborted ? 'timeout' : 'network_error' });
    return {
      status: 'failed',
      provider: 'twilio',
      errorCode: signal.aborted ? 'timeout' : 'network_error',
    };
  }
}

export async function sendSmsMessages(messages: SmsMessage[]): Promise<number> {
  const results = await mapInBatches(messages, sendSms);
  return results.filter(Boolean).length;
}

export function guestInviteSmsText(
  eventTitle: string,
  token: string,
): string {
  return (
    `You are invited to ${eventTitle} on Switchboard. ` +
    `See the plan (sign in to reply): ${appUrl(`/rsvp/${token}`)}`
  );
}
