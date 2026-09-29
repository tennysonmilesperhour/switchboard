'use client';

import { useState } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { updatePassword } from '@/lib/actions/auth';
import { deleteAccount, exportMyData } from '@/lib/actions/account';
import { PASSWORD_MIN_LENGTH } from '@/lib/auth-identity';
import { failure, type ErrorCode } from '@/lib/errors';
import { useConfirm } from '@/components/ui/ConfirmDialog';

/** A server action that threw instead of answering — a dropped connection, or a
 *  page left open across a deploy — still gets its code, not a stuck button. */
function interrupted(code: ErrorCode, what: string): string {
  const result = failure(code, `${what} Check your connection, reload the page, and try again.`);
  return `${result.error} · ${result.code}`;
}

export function AccountControls({ hostedPlanCount = 0 }: { hostedPlanCount?: number }) {
  const confirm = useConfirm();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<'password' | 'export' | 'delete' | null>(null);

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPending('password');
    try {
      const result = await updatePassword(password);
      setMessage(
        result.ok
          ? 'Password updated.'
          : [result.error ?? 'Could not update password.', result.code].filter(Boolean).join(' · '),
      );
      if (result.ok) setPassword('');
    } catch {
      setMessage(interrupted('SB-AUTH-RESET', 'Your password wasn’t changed.'));
    } finally {
      setPending(null);
    }
  }

  async function removeAccount(event: React.FormEvent) {
    event.preventDefault();
    if (!await confirm({
      title: 'Permanently delete your account?',
      body:
        hostedPlanCount > 0
          ? `Your profile and personal data will be removed. The ${hostedPlanCount === 1 ? 'upcoming plan you host goes' : `${hostedPlanCount} upcoming plans you host go`} with it, and everyone who said yes will be told it’s off. This cannot be undone.`
          : 'Your profile and personal data will be removed. This cannot be undone.',
      confirmLabel: 'Delete account',
      danger: true,
    })) return;
    setPending('delete');
    try {
      const result = await deleteAccount(confirmation);
      setPending(null);
      if (!result.ok) {
        setMessage(
          [result.error ?? 'Could not delete account.', result.code]
            .filter(Boolean)
            .join(' · '),
        );
      }
    } catch (error) {
      // A successful delete redirects to /welcome, which Next delivers to this
      // call as a rejection while it navigates. Let it through and leave
      // "Deleting..." up; anything else is a real interruption.
      unstable_rethrow(error);
      setPending(null);
      setMessage(interrupted('SB-AUTH-DELETE', 'Switchboard didn’t confirm the deletion.'));
    }
  }

  async function downloadData() {
    setPending('export');
    let result: Awaited<ReturnType<typeof exportMyData>>;
    try {
      result = await exportMyData();
    } catch {
      setMessage(interrupted('SB-ACCOUNT-EXPORT', 'Your data download wasn’t prepared.'));
      return;
    } finally {
      setPending(null);
    }
    if (!result.ok) {
      setMessage(
        [result.error ?? 'Could not prepare your data.', result.code]
          .filter(Boolean)
          .join(' · '),
      );
      return;
    }

    const url = URL.createObjectURL(
      new Blob([result.json], { type: 'application/json;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    setMessage('Your Switchboard data download is ready.');
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

      <div className="space-y-3 border-t border-line pt-6">
        <div>
          <p className="text-sm font-bold text-ink">Download your data</p>
          <p className="mt-1 text-sm text-ink-soft">
            Get a JSON copy of your profile, plans, RSVPs, messages, and signals.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={pending !== null}
          onClick={downloadData}
        >
          {pending === 'export' ? 'Preparing...' : 'Download JSON'}
        </Button>
      </div>

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
