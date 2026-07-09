import { appUrl } from '@/lib/server/email';
import { normalizePhoneNumber, looksLikePhoneNumber } from '@/lib/phone';

export interface SmsMessage {
  to: string;
  body: string;
}

export { looksLikePhoneNumber, normalizePhoneNumber };

export function smsEnabled(): boolean {
  return Boolean(
    process.env.PLIVO_AUTH_ID &&
      process.env.PLIVO_AUTH_TOKEN &&
      process.env.PLIVO_FROM_NUMBER,
  );
}

export async function sendSms(message: SmsMessage): Promise<boolean> {
  const to = normalizePhoneNumber(message.to);
  if (!to) return false;
  if (!smsEnabled()) {
    console.info(`[sms:skipped] would send invite SMS to ${to}`);
    return false;
  }

  const authId = process.env.PLIVO_AUTH_ID as string;
  const authToken = process.env.PLIVO_AUTH_TOKEN as string;
  const from = process.env.PLIVO_FROM_NUMBER as string;
  const auth = Buffer.from(`${authId}:${authToken}`).toString('base64');

  // Plivo expects E.164 numbers without the leading '+'.
  const src = from.trim().replace(/^\+/, '');
  const dst = to.replace(/^\+/, '');

  try {
    const response = await fetch(
      `https://api.plivo.com/v1/Account/${authId}/Message/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ src, dst, text: message.body }),
      },
    );
    // Plivo returns 202 Accepted on success (response.ok covers 200-299).
    if (!response.ok) {
      console.error(`[sms:failed] ${response.status} sending to ${to}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[sms:error]', error);
    return false;
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
