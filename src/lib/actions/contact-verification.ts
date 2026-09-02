'use server';

import { failure, validation, type ErrorCode } from '@/lib/errors';

import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireUser } from '@/lib/server/require-user';
import { checkRateLimit } from '@/lib/server/rate-limit';
import { appUrl, sendEmailWithResult } from '@/lib/server/email';
import { sendSmsWithResult } from '@/lib/server/sms';
import { reportAndFail } from '@/lib/server/observability';

export type ContactKind = 'email' | 'phone';

export interface ContactVerificationResult {
  ok: boolean;
  error?: string;
  /** Stable failure code from `@/lib/errors`, shown beside the message. */
  code?: ErrorCode;
  /** The next step, when the reader has one. */
  fix?: string | null;
  message?: string;
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function verificationSecret(): string | null {
  return process.env.CONTACT_VERIFICATION_SECRET?.trim() || null;
}

function phoneCodeHash(userId: string, normalizedValue: string, code: string): string | null {
  const secret = verificationSecret();
  if (!secret) return null;
  return createHmac('sha256', secret)
    .update(`${userId}:${normalizedValue}:${code}`)
    .digest('hex');
}

function hashesMatch(left: string | null, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function requestContactVerification(
  kind: ContactKind,
): Promise<ContactVerificationResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;

  if (!(await checkRateLimit(
    `contact-verify-send:${user.id}:${kind}`,
    4,
    60 * 60,
    { failClosed: true },
  ))) {
    return failure('SB-RATE-LIMIT', 'Too many verification requests. Try again later.');
  }

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from('profile_contacts')
    .select('normalized_value, verified_at')
    .eq('user_id', user.id)
    .eq('kind', kind)
    .maybeSingle();

  if (!contact) {
    return validation(`Add a ${kind === 'email' ? 'contact email' : 'phone number'} first.`);
  }
  if (contact.verified_at) return { ok: true, message: 'That contact is already verified.' };

  await admin
    .from('contact_verification_requests')
    .delete()
    .eq('user_id', user.id)
    .eq('kind', kind);

  if (kind === 'email') {
    const token = randomBytes(32).toString('base64url');
    const { error: requestError } = await admin.from('contact_verification_requests').insert({
      user_id: user.id,
      kind,
      normalized_value: contact.normalized_value,
      token_hash: tokenHash(token),
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });
    if (requestError) {
      return reportAndFail(
        'SB-VERIFY-START',
        'contact.verify-start',
        requestError,
        { kind },
      );
    }

    const delivery = await sendEmailWithResult({
      to: contact.normalized_value,
      subject: 'Verify your Switchboard email',
      text:
        `Confirm this email for Switchboard contact matching:\n\n` +
        `${appUrl(`/verify-contact?token=${encodeURIComponent(token)}`)}\n\n` +
        `This link expires in 30 minutes. If you did not request it, ignore this message.`,
    });
    if (delivery.status !== 'sent') {
      await admin
        .from('contact_verification_requests')
        .delete()
        .eq('user_id', user.id)
        .eq('kind', kind);
      if (delivery.status === 'not_configured') return failure('SB-CONFIG-EMAIL');
      return reportAndFail(
        'SB-VERIFY-START',
        'contact.verify-start',
        new Error(`email delivery failed: ${delivery.status}`),
        { kind },
        'The verification email could not be sent. Try again later.',
      );
    }
    return { ok: true, message: 'Verification email sent. It expires in 30 minutes.' };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = phoneCodeHash(user.id, contact.normalized_value, code);
  if (!codeHash) {
    return failure('SB-CONFIG-SMS');
  }
  const { error: requestError } = await admin.from('contact_verification_requests').insert({
    user_id: user.id,
    kind,
    normalized_value: contact.normalized_value,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  if (requestError) {
    return reportAndFail('SB-VERIFY-START', 'contact.verify-start', requestError, { kind });
  }

  const delivery = await sendSmsWithResult({
    to: contact.normalized_value,
    body: `Your Switchboard verification code is ${code}. It expires in 10 minutes.`,
  });
  if (delivery.status !== 'sent') {
    await admin
      .from('contact_verification_requests')
      .delete()
      .eq('user_id', user.id)
      .eq('kind', kind);
    if (delivery.status === 'not_configured') return failure('SB-CONFIG-SMS');
    return reportAndFail(
      'SB-VERIFY-START',
      'contact.verify-start',
      new Error(`SMS delivery failed: ${delivery.status}`),
      { kind },
      'The verification text could not be sent. Try again later.',
    );
  }
  return { ok: true, message: 'Verification code sent. It expires in 10 minutes.' };
}

export async function confirmPhoneContact(code: string): Promise<ContactVerificationResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const { user } = auth;
  const cleaned = code.replace(/\D/g, '');
  if (cleaned.length !== 6) return validation('Enter the six-digit code.');
  if (!(await checkRateLimit(
    `contact-verify-code:${user.id}`,
    8,
    15 * 60,
    { failClosed: true },
  ))) {
    return failure('SB-RATE-LIMIT', 'Too many code attempts. Request a new code later.');
  }

  const admin = createAdminClient();
  const { data: request } = await admin
    .from('contact_verification_requests')
    .select('normalized_value, code_hash, attempts, expires_at')
    .eq('user_id', user.id)
    .eq('kind', 'phone')
    .maybeSingle();
  if (!request || !request.code_hash || new Date(request.expires_at).getTime() <= Date.now()) {
    return validation('That code expired. Request a new one.');
  }

  const submittedHash = phoneCodeHash(user.id, request.normalized_value, cleaned);
  if (!hashesMatch(submittedHash, request.code_hash)) {
    await admin
      .from('contact_verification_requests')
      .update({ attempts: Math.min(request.attempts + 1, 10) })
      .eq('user_id', user.id)
      .eq('kind', 'phone');
    return validation('That code did not match.');
  }

  const { error } = await admin
    .from('profile_contacts')
    .update({ verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('kind', 'phone')
    .eq('normalized_value', request.normalized_value);
  if (error) {
    if (error.code === '23505') {
      return validation('That phone number is already verified on another account.');
    }
    return reportAndFail('SB-VERIFY-CHECK', 'contact.verify-check', error, { kind: 'phone' });
  }
  await admin
    .from('contact_verification_requests')
    .delete()
    .eq('user_id', user.id)
    .eq('kind', 'phone');
  revalidatePath('/settings');
  return { ok: true, message: 'Phone number verified.' };
}

export async function confirmEmailContact(formData: FormData): Promise<never> {
  const auth = await requireUser();
  const token = String(formData.get('token') ?? '');
  if (!auth.ok || token.length < 32) redirect('/login?error=auth');

  const admin = createAdminClient();
  const { data: request } = await admin
    .from('contact_verification_requests')
    .select('normalized_value, expires_at')
    .eq('user_id', auth.user.id)
    .eq('kind', 'email')
    .eq('token_hash', tokenHash(token))
    .maybeSingle();
  if (!request || new Date(request.expires_at).getTime() <= Date.now()) {
    redirect('/settings?contact=expired');
  }

  const { error } = await admin
    .from('profile_contacts')
    .update({ verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', auth.user.id)
    .eq('kind', 'email')
    .eq('normalized_value', request.normalized_value);
  if (error) {
    redirect(error.code === '23505' ? '/settings?contact=claimed' : '/settings?contact=error');
  }
  await admin
    .from('contact_verification_requests')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('kind', 'email');
  revalidatePath('/settings');
  redirect('/settings?contact=verified');
}
