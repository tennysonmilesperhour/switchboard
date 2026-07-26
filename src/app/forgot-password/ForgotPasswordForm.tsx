'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { requestPasswordReset } from '@/lib/actions/auth';

export function ForgotPasswordForm() {
  const [identifier, setIdentifier] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const result = await requestPasswordReset(identifier);
      setMessage(
        result.ok
          ? 'If an account matches and has a verified recovery email, we’ll send instructions. Username-only accounts need a verified recovery email before they can receive a reset.'
          : result.error ?? 'Enter your email or username.',
      );
    } catch {
      setMessage('Recovery is temporarily unavailable. Please try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-3">
      <label htmlFor="reset-identifier" className="sr-only">Email or username</label>
      <input
        id="reset-identifier"
        required
        autoComplete="username"
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        placeholder="Email or username"
        className="w-full rounded-card border border-line bg-card px-4 py-3.5 outline-none focus:border-terracotta"
      />
      {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? 'Sending...' : 'Send recovery instructions'}
      </Button>
    </form>
  );
}
