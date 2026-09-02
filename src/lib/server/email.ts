/**
 * Off-platform delivery. Switchboard reaches guests who aren't logged in the
 * same way Partiful does - except we use email, not a phone number, so a guest
 * never has to hand over their number to RSVP.
 *
 * Like push (see notify.ts), this is best-effort and degradable: with no
 * provider configured it logs and returns false, so nothing in the invite or
 * reminder path ever blocks on it. Uses the Resend HTTP API (no SDK / no new
 * dependency); set RESEND_API_KEY and EMAIL_FROM to turn it on.
 */

import { isEmail } from '@/lib/auth-identity';
import { absoluteUrl } from '@/lib/links';
import { mapInBatches } from '@/lib/server/batches';

export const PROVIDER_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always provided; html is an optional richer version. */
  text: string;
  html?: string;
}

export type DeliveryStatus = 'sent' | 'not_configured' | 'invalid_recipient' | 'failed';

export interface ProviderDeliveryResult {
  status: DeliveryStatus;
  provider: 'resend' | 'twilio';
  providerMessageId?: string;
  errorCode?: string;
}

/** Loose email check - enough to avoid mailing a phone number by mistake. */
export function looksLikeEmail(value: string | null | undefined): value is string {
  return isEmail(value);
}

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

/**
 * Send one email. Never throws; returns whether it was actually dispatched.
 * Skips silently (returning false) when the address is unusable or the
 * provider isn't configured.
 */
export async function sendEmail(message: EmailMessage): Promise<boolean> {
  return (await sendEmailWithResult(message)).status === 'sent';
}

/** Send one email and return an operator-safe outcome for delivery tracking. */
export async function sendEmailWithResult(
  message: EmailMessage,
): Promise<ProviderDeliveryResult> {
  if (!looksLikeEmail(message.to)) {
    return { status: 'invalid_recipient', provider: 'resend' };
  }
  if (!emailEnabled()) {
    console.info('[email:skipped] provider is not configured');
    return { status: 'not_configured', provider: 'resend' };
  }

  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });
    if (!response.ok) {
      console.error(`[email:failed] provider returned ${response.status}`);
      return {
        status: 'failed',
        provider: 'resend',
        errorCode: `http_${response.status}`,
      };
    }
    const body = await response.json().catch(() => null) as { id?: unknown } | null;
    return {
      status: 'sent',
      provider: 'resend',
      providerMessageId: typeof body?.id === 'string' ? body.id : undefined,
    };
  } catch (error) {
    console.error('[email:error]', error);
    return {
      status: 'failed',
      provider: 'resend',
      errorCode: signal.aborted ? 'timeout' : 'network_error',
    };
  }
}

/** Send in bounded groups; returns how many were dispatched. */
export async function sendEmails(messages: EmailMessage[]): Promise<number> {
  const results = await mapInBatches(messages, sendEmail);
  return results.filter(Boolean).length;
}

/**
 * Absolute URL for a path, using the configured app origin.
 *
 * Kept as the name the send paths already import; the implementation (and the
 * validation of what counts as a usable origin) lives in one place now — see
 * `src/lib/links.ts`.
 */
export function appUrl(path = ''): string {
  return absoluteUrl(path);
}
