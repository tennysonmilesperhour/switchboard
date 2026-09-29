'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatRelative } from '@/lib/format';
import { liftSuspension } from '@/lib/actions/moderation';
import { suspensionLabel } from '@/lib/suspension';

export interface SuspendedAccount {
  member_id: string;
  display_name: string | null;
  handle: string | null;
  suspended_until: string;
  /** Null when the account was suspended outside the app. */
  suspended_at: string | null;
  note: string | null;
}

/**
 * Everyone suspended right now, and the one way back in that the app offers:
 * a moderator lifting it after an appeal to the support address the person
 * was shown when sign-in refused them.
 */
export function SuspendedAccountsClient({ accounts }: { accounts: SuspendedAccount[] }) {
  return (
    <ul className="space-y-3">
      {accounts.map((account) => (
        <li key={account.member_id}>
          <SuspendedAccountCard account={account} />
        </li>
      ))}
    </ul>
  );
}

function SuspendedAccountCard({ account }: { account: SuspendedAccount }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const name = account.display_name || (account.handle ? `@${account.handle}` : 'This member');

  async function lift() {
    const ok = await confirm({
      title: `Lift ${name}’s suspension?`,
      body: 'They can sign in again straight away. The suspension and its lifting both stay on the record.',
      confirmLabel: 'Lift suspension',
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await liftSuspension(account.member_id);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not lift the suspension.', result.code);
        return;
      }
      toast.success(`${name} can sign in again.`);
      router.refresh();
    });
  }

  return (
    <Card>
      <p className="text-sm">
        {account.handle ? (
          <Link
            href={`/u/${account.handle}`}
            className="font-bold text-terracotta-deep hover:underline"
          >
            {name}
          </Link>
        ) : (
          <span className="font-bold">{name}</span>
        )}
        <span className="text-ink-soft"> is suspended {suspensionLabel(account.suspended_until)}</span>
      </p>
      {account.note ? (
        <p className="mt-1.5 rounded-card bg-cream p-3 text-sm text-ink-soft break-words">
          “{account.note}”
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-ink-faint">
        {account.suspended_at
          ? `Suspended ${formatRelative(account.suspended_at)}`
          : 'Suspended outside the app'}
      </p>
      <div className="mt-2">
        <Button size="sm" variant="secondary" className="min-h-11" disabled={pending} onClick={lift}>
          Lift suspension
        </Button>
      </div>
    </Card>
  );
}
