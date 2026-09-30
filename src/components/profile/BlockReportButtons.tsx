'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmDialog';
import { blockProfile, reportProfile, unblockProfile } from '@/lib/actions/connections';

interface BlockReportButtonsProps {
  targetId: string;
  name: string;
  /** The viewer has already blocked this person: offer Unblock, not Block. */
  blocked?: boolean;
}

export function BlockReportButtons({ targetId, name, blocked = false }: BlockReportButtonsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const askReason = usePrompt();

  function handleBlock() {
    void (async () => {
      const ok = await confirm({
        title: `Block ${name}?`,
        body: 'You’ll stop being connected, and they won’t find you in discovery or on the map or be able to reconnect. They won’t be told.',
        confirmLabel: 'Block',
        danger: true,
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await blockProfile(targetId);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not block that person.', result.code);
          return;
        }
        toast.success(`${name} is blocked.`);
        router.refresh();
      });
    })();
  }

  function handleUnblock() {
    startTransition(async () => {
      const result = await unblockProfile(targetId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not unblock that person.', result.code);
        return;
      }
      toast.success(`${name} is unblocked. Nothing else comes back — either of you can ask to connect again.`);
      router.refresh();
    });
  }

  async function handleReport() {
    const reason = await askReason({
      title: `Report ${name}?`,
      body: 'A sentence is plenty. A moderator reads it, and they won’t be told who sent it.',
      confirmLabel: 'Send report',
    });
    if (!reason) return;
    startTransition(async () => {
      const result = await reportProfile(targetId, reason);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send the report.', result.code);
        return;
      }
      toast.success('Report received.');
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={handleReport}
        className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
      >
        Report
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={blocked ? handleUnblock : handleBlock}
        className="rounded-pill px-2 py-1 text-xs font-semibold text-rose-deep hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
      >
        {blocked ? 'Unblock' : 'Block'}
      </button>
    </div>
  );
}
