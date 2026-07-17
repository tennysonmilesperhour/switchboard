import { appUrl, type ProviderDeliveryResult } from '@/lib/server/email';
import { normalizePhoneNumber, looksLikePhoneNumber } from '@/lib/phone';

export interface SmsMessage {
  to: string;
  body: string;
}

export { looksLikePhoneNumber, normalizePhoneNumber };

export function smsEnabled(): boolean {
  return Boolean(
    process.env.PLIVO_AUTH_ID
      && process.env.PLIVO_AUTH_TOKEN
      && process.env.PLIVO_FROM_NUMBER,
  );
}

export async function sendSms(message: SmsMessage): Promise<boolean> {
  return (await sendSmsWithResult(message)).status === 'sent';
}

/** Send one SMS and return an operator-safe outcome for delivery tracking. */
export async function sendSmsWithResult(
  message: SmsMessage,
): Promise<ProviderDeliveryResult> {
  const to = normalizePhoneNumber(message.to);
  if (!to) return { status: 'invalid_recipient', provider: 'plivo' };
  if (!smsEnabled()) {
    console.info('[sms:skipped] provider is not configured');
    return { status: 'not_configured', provider: 'plivo' };
  }

  const authId = process.env.PLIVO_AUTH_ID as string;
  const authToken = process.env.PLIVO_AUTH_TOKEN as string;
  const from = normalizePhoneNumber(process.env.PLIVO_FROM_NUMBER) as string;
  const authorization = Buffer.from(`${authId}:${authToken}`).toString('base64');

  try {
    const response = await fetch(`https://api.plivo.com/v1/Account/${authId}/Message/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        src: from,
        dst: to,
        text: message.body,
      }),
    });
    if (!response.ok) {
      console.error(`[sms:failed] provider returned ${response.status}`);
      return {
        status: 'failed',
        provider: 'plivo',
        errorCode: `http_${response.status}`,
      };
    }
    const body = await response.json().catch(() => null) as
      | { message_uuid?: unknown; messageUuid?: unknown; error?: unknown }
      | null;
    if (body?.error) {
      return { status: 'failed', provider: 'plivo', errorCode: 'provider_error' };
    }
    const firstMessageUuid = Array.isArray(body?.message_uuid)
      ? body.message_uuid[0]
      : Array.isArray(body?.messageUuid)
        ? body.messageUuid[0]
        : undefined;
    const providerMessageId = typeof firstMessageUuid === 'string'
      ? firstMessageUuid
      : typeof body?.message_uuid === 'string'
        ? body.message_uuid
        : typeof body?.messageUuid === 'string'
          ? body.messageUuid
          : undefined;
    return { status: 'sent', provider: 'plivo', providerMessageId };
  } catch (error) {
    console.error('[sms:error]', error);
    return { status: 'failed', provider: 'plivo', errorCode: 'network_error' };
  }
}

export async function sendSmsMessages(messages: SmsMessage[]): Promise<number> {
  const results = await Promise.all(messages.map(sendSms));
  return results.filter(Boolean).length;
}

export function guestInviteSmsText(
  eventTitle: string,
  token: string,
): string {
  return (
    `You are invited to ${eventTitle} on Switchboard. ` +
    `RSVP or create an account: ${appUrl(`/rsvp/${token}`)}`
  );
}
