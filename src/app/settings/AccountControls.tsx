'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { deleteAccount, updatePassword } from '@/lib/actions/auth';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-identity';
import { useConfirm } from '@/components/ui/ConfirmDialog';

export function AccountControls() {
  const confirm = useConfirm();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<'password' | 'delete' | null>(null);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPending('password');
    const result = await updatePassword(password);
    setPending(null);
    setMessage(result.ok ? 'Password updated.' : result.error ?? 'Could not update password.');
    if (result.ok) setPassword('');
  }

  async function removeAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!await confirm({
      title: 'Permanently delete your account?',
      body: 'Your profile and associated personal data will be removed. This cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
    })) return;
    setPending('delete');
    const result = await deleteAccount(confirmation);
    setPending(null);
    if (!result.ok) setMessage(result.error ?? 'Could not delete account.');
  }

  return (
    <div className="space-y-6">
      <form onSubmit={changePassword} className="space-y-3">
        <label htmlFor="settings-password" className="text-sm font-medium text-ink">
          Change password
        </label>
        <input
          id="settings-password"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="New password"
          className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-terracotta"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={pending !== null}>
          {pending === 'password' ? 'Updating...' : 'Update password'}
        </Button>
      </form>

      <form onSubmit={removeAccount} className="space-y-3 border-t border-line pt-6">
        <div>
          <p className="text-sm font-bold text-rose-deep">Delete account</p>
          <p className="mt-1 text-sm text-ink-soft">Type DELETE to permanently remove your account.</p>
        </div>
        <input
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="DELETE"
          aria-label="Type DELETE to confirm"
          className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-sm outline-none focus:border-rose"
        />
        <Button type="submit" size="sm" variant="danger" disabled={pending !== null}>
          {pending === 'delete' ? 'Deleting...' : 'Delete account'}
        </Button>
      </form>
      {message ? <p role="status" className="text-sm text-ink-soft">{message}</p> : null}
    </div>
  );
}
