'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { blockProfile, reportProfile } from '@/lib/actions/connections';

interface BlockReportButtonsProps {
  targetId: string;
  name: string;
  connectionId?: string | null;
}

export function BlockReportButtons({ targetId, name, connectionId }: BlockReportButtonsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function handleBlock() {
    void (async () => {
      const ok = await confirm({
        title: `Block ${name}?`,
        body: 'They will be removed from your connections, discovery, and the map. They won’t be told.',
        confirmLabel: 'Block',
        danger: true,
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await blockProfile(targetId, connectionId ?? undefined);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not block that person.', result.code);
          return;
        }
        router.refresh();
      });
    })();
  }

  function handleReport() {
    const reason = window.prompt(`Briefly describe why you are reporting ${name}.`);
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
