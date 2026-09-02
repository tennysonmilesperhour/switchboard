'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ui/Toast';
import {
  blockMomentCandidate,
  reportMomentCandidate,
} from '@/lib/actions/moments';

/**
 * Safety controls for a candidate whose identity has not been mutually
 * revealed. Only moment ids cross the client boundary; the actions resolve and
 * revalidate the owner on the server.
 */
export function AnonymousMomentSafetyButtons({
  myMomentId,
  candidateMomentId,
}: {
  myMomentId: string;
  candidateMomentId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();

  function handleBlock() {
    void (async () => {
      const ok = await confirm({
        title: 'Block this person?',
        body: 'They will disappear from Moments, discovery, and the map. Their identity stays hidden and they will not be told.',
        confirmLabel: 'Block',
        danger: true,
      });
      if (!ok) return;
      startTransition(async () => {
        const result = await blockMomentCandidate(myMomentId, candidateMomentId);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not block this person.', result.code);
          return;
        }
        router.refresh();
      });
    })();
  }

  function handleReport() {
    const reason = window.prompt('Briefly describe why you are reporting this person.');
    if (!reason) return;
    startTransition(async () => {
      const result = await reportMomentCandidate(
        myMomentId,
        candidateMomentId,
        reason,
      );
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
