'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { updatePassword } from '@/lib/actions/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-identity';

export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await updatePassword(password);
    setPending(false);
    if (result.ok) {
      setComplete(true);
      setMessage('Password updated. You can continue to Switchboard.');
    } else {
      setMessage(result.error ?? 'Could not update your password.');
    }
  }

  return (
    <form onSubmit={submit} className="mt-7 space-y-3">
      {!complete ? (
        <input
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password"
          aria-label="New password"
          className="w-full rounded-card border border-line bg-card px-4 py-3.5 outline-none focus:border-terracotta"
        />
      ) : null}
      {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
      {complete ? (
        <Button type="button" size="lg" className="w-full" onClick={() => window.location.assign('/')}>
          Continue
        </Button>
      ) : (
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? 'Updating...' : 'Update password'}
        </Button>
      )}
    </form>
  );
}
