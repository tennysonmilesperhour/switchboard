'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { updatePassword } from '@/lib/actions/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-identity';
import { errorRef, type ErrorCode } from '@/lib/errors';

export function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [code, setCode] = useState<ErrorCode | null>(null);
  const [complete, setComplete] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setCode(null);
    try {
      const result = await updatePassword(password);
      if (result.ok) {
        setComplete(true);
        setMessage('Password updated. You can continue to Switchboard.');
      } else {
        setMessage(result.error ?? 'Could not update your password.');
        setCode(result.code ?? null);
      }
    } catch {
      // The action never answered: a dropped connection, or a page left open
      // across a deploy. Without this the button sat on "Updating..." forever.
      // Reloading is safe — the page keeps the recovery session, and shows the
      // way to a fresh link if that session has gone.
      setMessage(
        'Switchboard didn’t respond, so your password wasn’t changed. Check your connection, reload this page, and try again.',
      );
    } finally {
      setPending(false);
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
      {message ? (
        <p role="status" className="text-sm text-ink-soft">
          {message}
          {code ? (
            <span className="mt-1 block text-xs text-ink-faint">{errorRef(code)}</span>
          ) : null}
        </p>
      ) : null}
      {complete ? (
        // A full load on purpose: the new password replaced the session cookies,
        // and the proxy and layout must read those, not the recovery session a
        // client transition would carry (docs/AUTH.md).
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
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
