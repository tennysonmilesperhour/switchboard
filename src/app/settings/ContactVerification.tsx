'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { failure } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import {
  type ContactVerificationResult,
  confirmPhoneContact,
  requestContactVerification,
} from '@/lib/actions/contact-verification';

interface ContactVerificationProps {
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export function ContactVerification({
  email,
  phone,
  emailVerified,
  phoneVerified,
}: ContactVerificationProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<ContactVerificationResult | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [activeAction, setActiveAction] = useState<'email' | 'phone' | 'confirm' | null>(null);
  useEffect(() => {
    if (!cooldown) return;
    const timer = window.setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [code, setCode] = useState('');

  function request(kind: 'email' | 'phone') {
    setMessage('');
    setError(null);
    setActiveAction(kind);
    startTransition(async () => {
      try {
        const result = await requestContactVerification(kind);
        if (!result.ok) {
          setError(result);
          return;
        }
        if (kind === 'phone') {
          setPhoneCodeSent(true);
          setCooldown(30);
        }
        setMessage(result.message ?? 'Verification requested.');
      } catch {
        setError(failure('SB-VERIFY-START', 'The verification request was interrupted.'));
      }
    });
  }

  function confirmPhone() {
    setMessage('');
    setError(null);
    setActiveAction('confirm');
    startTransition(async () => {
      try {
        const result = await confirmPhoneContact(code);
        if (!result.ok) {
          setError(result);
          return;
        }
        setMessage(result.message ?? 'Phone number verified.');
        setPhoneCodeSent(false);
        setCode('');
        router.refresh();
      } catch {
        setError(failure('SB-VERIFY-CHECK', 'The verification check was interrupted.'));
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">Email</p>
          <p className="truncate text-sm text-ink-soft">{email ?? 'Not added'}</p>
          {email && (
            <p className={`text-xs font-semibold ${emailVerified ? 'text-sage-deep' : 'text-gold-deep'}`}>
              {emailVerified ? 'Verified' : 'Not verified'}
            </p>
          )}
        </div>
        {email && !emailVerified && (
          <Button type="button" variant="secondary" disabled={pending} onClick={() => request('email')}>
            {pending && activeAction === 'email' ? 'Sending…' : 'Send link'}
          </Button>
        )}
      </div>

      <div className="border-t border-line pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-ink">Phone</p>
            <p className="truncate text-sm text-ink-soft">{phone ?? 'Not added'}</p>
            {phone && (
              <p className={`text-xs font-semibold ${phoneVerified ? 'text-sage-deep' : 'text-gold-deep'}`}>
                {phoneVerified ? 'Verified' : 'Not verified'}
              </p>
            )}
          </div>
          {phone && !phoneVerified && (
            <Button type="button" variant="secondary" disabled={pending || cooldown > 0} onClick={() => request('phone')}>
              {pending && activeAction === 'phone' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : phoneCodeSent ? 'Resend code' : 'Text code'}
            </Button>
          )}
        </div>
        {phone && !phoneVerified && (
          <p className="mt-2 text-xs text-ink-soft">
            Choose Text code to receive a one-time verification text. Message and data rates may apply.
          </p>
        )}
        {phoneCodeSent && !phoneVerified && (
          <div className="mt-3 flex gap-2">
            <label htmlFor="phone-verification-code" className="sr-only">Verification code</label>
            <input
              id="phone-verification-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              className="min-w-0 flex-1 rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
            />
            <Button type="button" disabled={pending || code.length !== 6} onClick={confirmPhone}>
              {pending && activeAction === 'confirm' ? 'Checking…' : 'Verify'}
            </Button>
          </div>
        )}
      </div>

      {!email && !phone && (
        <p className="text-sm text-ink-soft">
          Add an email or phone number from Edit profile before verifying it.
        </p>
      )}
      {error && (
        <div role="alert">
          <ErrorNotice message={error.error ?? 'Verification failed.'} code={error.code} fix={error.fix} />
        </div>
      )}
      {message && <p role="status" className="text-sm text-sage-deep">{message}</p>}
    </div>
  );
}
