import 'server-only';

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
import { supportEmail } from '@/lib/contact';
import { absoluteUrl } from '@/lib/links';
import { mapInBatches } from '@/lib/server/batches';

export const PROVIDER_TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always provided; html is an optional richer version. */
  text: string;
  html?: string;
  /** Provider-level message headers, such as an RFC 2369 unsubscribe route. */
  headers?: Record<string, string>;
  /** Where a reply goes, when it should reach a person rather than the sender. */
  replyTo?: string;
}

export type DeliveryStatus =
  | 'sent'
  | 'not_configured'
  | 'invalid_recipient'
  | 'opted_out'
  | 'failed';

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

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const RESEND_HOST = new URL(RESEND_ENDPOINT).hostname;

/**
 * Where Resend-format mail is posted: `RESEND_API_URL` when it is usable,
 * otherwise Resend itself. Usable means one of two places, with no
 * credentials, query or fragment of its own:
 *
 * - Resend's own host over https (a different path on it), or
 * - a loopback address, which is what the browser suite runs in front of the
 *   local stack's mail catcher (e2e/mail-relay.ts) so sign-up and password
 *   reset can be walked end to end.
 *
 * Nothing else, not even another https host: the API key travels with every
 * request, so a typo or a tampered setting must never send it to a server
 * nobody chose. Anything else falls back to Resend.
 */
export function resendEndpoint(raw: string | null | undefined): string {
  const value = raw?.trim();
  if (!value) return RESEND_ENDPOINT;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) return RESEND_ENDPOINT;
    if (url.protocol === 'https:' && url.hostname === RESEND_HOST) return url.toString();
    if ((url.protocol === 'http:' || url.protocol === 'https:') && LOOPBACK_HOSTS.has(url.hostname)) {
      return url.toString();
    }
    return RESEND_ENDPOINT;
  } catch {
    return RESEND_ENDPOINT;
  }
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
    const response = await fetch(resendEndpoint(process.env.RESEND_API_URL), {
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
        ...(message.headers ? { headers: message.headers } : {}),
        ...(message.replyTo ? { reply_to: message.replyTo } : {}),
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

/** List-level escape hatch on every email sent to an off-platform guest. */
export function guestEmailHeaders(): Record<string, string> {
  return {
    'List-Unsubscribe': `<mailto:${supportEmail()}?subject=unsubscribe>`,
  };
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
