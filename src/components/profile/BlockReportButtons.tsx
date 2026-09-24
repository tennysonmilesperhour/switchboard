'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useConfirm, usePrompt } from '@/components/ui/ConfirmDialog';
import { blockProfile, reportProfile } from '@/lib/actions/connections';

interface BlockReportButtonsProps {
  targetId: string;
  name: string;
}

export function BlockReportButtons({ targetId, name }: BlockReportButtonsProps) {
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
        className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink"
      >
        Report
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={handleBlock}
        className="rounded-pill px-2 py-1 text-xs font-semibold text-rose-deep hover:text-rose"
      >
        Block
      </button>
    </div>
  );
}
