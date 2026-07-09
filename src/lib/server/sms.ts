import { appUrl } from '@/lib/server/email';
import { normalizePhoneNumber, looksLikePhoneNumber } from '@/lib/phone';

export interface SmsMessage {
  to: string;
  body: string;
}

export { looksLikePhoneNumber, normalizePhoneNumber };

export function smsEnabled(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER,
  );
}

export async function sendSms(message: SmsMessage): Promise<boolean> {
  const to = normalizePhoneNumber(message.to);
  if (!to) return false;
  if (!smsEnabled()) {
    console.info(`[sms:skipped] would send invite SMS to ${to}`);
    return false;
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID as string;
  const authToken = process.env.TWILIO_AUTH_TOKEN as string;
  const from = process.env.TWILIO_FROM_NUMBER as string;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams({ To: to, From: from, Body: message.body });

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
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
