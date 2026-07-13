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

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Always provided; html is an optional richer version. */
  text: string;
  html?: string;
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
  if (!looksLikeEmail(message.to)) return false;
  if (!emailEnabled()) {
    // Degraded mode: make it observable in logs without failing the caller.
    console.info(`[email:skipped] would send "${message.subject}" to ${message.to}`);
    return false;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
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
      console.error(`[email:failed] ${response.status} sending to ${message.to}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email:error]', error);
    return false;
  }
}

/** Send to several addresses concurrently; returns how many were dispatched. */
export async function sendEmails(messages: EmailMessage[]): Promise<number> {
  const results = await Promise.all(messages.map(sendEmail));
  return results.filter(Boolean).length;
}

/** Absolute URL for a path, using the configured app origin. */
export function appUrl(path = ''): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (!configured && process.env.NODE_ENV === 'production') {
    throw new Error('NEXT_PUBLIC_APP_URL must be configured in production');
  }
  const base = (configured ?? 'http://localhost:3000').replace(/\/$/, '');
  return `${base}${path}`;
}
