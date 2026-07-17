'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import {
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
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [code, setCode] = useState('');

  function request(kind: 'email' | 'phone') {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await requestContactVerification(kind);
      if (!result.ok) {
        setError(result.error ?? 'Could not start verification.');
        return;
      }
      if (kind === 'phone') setPhoneCodeSent(true);
      setMessage(result.message ?? 'Verification sent.');
    });
  }

  function confirmPhone() {
    setMessage('');
    setError('');
    startTransition(async () => {
      const result = await confirmPhoneContact(code);
      if (!result.ok) {
        setError(result.error ?? 'Could not verify that code.');
        return;
      }
      setMessage(result.message ?? 'Phone number verified.');
      setPhoneCodeSent(false);
      window.location.reload();
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
            Send link
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
            <Button type="button" variant="secondary" disabled={pending} onClick={() => request('phone')}>
              Text code
            </Button>
          )}
        </div>
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
              Verify
            </Button>
          </div>
        )}
      </div>

      {!email && !phone && (
        <p className="text-sm text-ink-soft">
          Add an email or phone number from Edit profile before verifying it.
        </p>
      )}
      {(message || error) && (
        <p role={error ? 'alert' : 'status'} className={`text-sm ${error ? 'text-rose-deep' : 'text-sage-deep'}`}>
          {error || message}
        </p>
      )}
    </div>
  );
}
