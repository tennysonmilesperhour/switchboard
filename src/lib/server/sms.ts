import { appUrl, type ProviderDeliveryResult } from '@/lib/server/email';
import { normalizePhoneNumber, looksLikePhoneNumber } from '@/lib/phone';

export interface SmsMessage {
  to: string;
  body: string;
}

export { looksLikePhoneNumber, normalizePhoneNumber };

export function smsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID
      && process.env.TWILIO_AUTH_TOKEN
      && process.env.TWILIO_FROM_NUMBER,
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
  if (!to) return { status: 'invalid_recipient', provider: 'twilio' };
  if (!smsEnabled()) {
    console.info('[sms:skipped] provider is not configured');
    return { status: 'not_configured', provider: 'twilio' };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const authToken = process.env.TWILIO_AUTH_TOKEN as string;
  const from = normalizePhoneNumber(process.env.TWILIO_FROM_NUMBER) as string;
  const authorization = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const form = new URLSearchParams({
    From: from,
    To: to,
    Body: message.body,
  });

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authorization}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      },
    );
    if (!response.ok) {
      console.error(`[sms:failed] provider returned ${response.status}`);
      return {
        status: 'failed',
        provider: 'twilio',
        errorCode: `http_${response.status}`,
      };
    }
    const body = await response.json().catch(() => null) as
      | { sid?: unknown; error_code?: unknown }
      | null;
    if (body?.error_code) {
      return { status: 'failed', provider: 'twilio', errorCode: 'provider_error' };
    }
    return {
      status: 'sent',
      provider: 'twilio',
      providerMessageId: typeof body?.sid === 'string' ? body.sid : undefined,
    };
  } catch (error) {
    console.error('[sms:error]', error);
    return { status: 'failed', provider: 'twilio', errorCode: 'network_error' };
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
    `See the plan (sign in to reply): ${appUrl(`/rsvp/${token}`)}`
  );
}
