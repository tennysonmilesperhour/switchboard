'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { leaveZone } from '@/lib/actions/zones';

/**
 * "Leave zone", for anyone on the roster. RLS always let a member remove
 * themselves; there was simply no button. Leaving also ends your check-in
 * here, and is never held against you if you ask back into a private zone.
 */
export function ZoneLeave({
  zoneId,
  zoneName,
  isPrivate,
}: {
  zoneId: string;
  zoneName: string;
  isPrivate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();

  async function leave() {
    // Ask before the transition starts. Updates made inside an async
    // transition are held until the whole action settles, so a dialog opened
    // in there never paints and the action waits on an answer nobody can give.
    const ok = await confirm({
      title: `Leave ${zoneName}?`,
      body: isPrivate
        ? 'You’ll stop seeing who’s here, and any check-in here ends. You can ask to come back, or use an invite link.'
        : 'Any check-in here ends. The zone stays public, so you can come back any time.',
      confirmLabel: 'Leave zone',
      danger: true,
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await leaveZone(zoneId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not leave the zone.', result.code);
        return;
      }
      toast.success(`You left ${zoneName}.`);
      router.push('/zones');
    });
  }

  return (
    <button
      type="button"
      onClick={leave}
      disabled={pending}
      className="inline-flex min-h-11 items-center rounded-pill px-2 text-sm font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
    >
      Leave zone
    </button>
  );
}
