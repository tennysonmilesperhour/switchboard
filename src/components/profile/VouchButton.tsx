'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { vouchForFact, withdrawVouch } from '@/lib/actions/facts';

/** Vouch for a connection's claim, or take your vouch back. */
export function VouchButton({
  factId,
  name,
  vouched,
}: {
  factId: string;
  name: string;
  vouched: boolean;
}) {
  const [done, setDone] = useState(vouched);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  function toggle() {
    startTransition(async () => {
      const result = done ? await withdrawVouch(factId) : await vouchForFact(factId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save that.', result.code);
        return;
      }
      setDone(!done);
      toast.success(done ? 'Vouch withdrawn.' : `You vouched for ${name}.`);
      router.refresh();
    });
  }

  return (
    <Button size="sm" variant={done ? 'ghost' : 'secondary'} disabled={pending} onClick={toggle}>
      {pending ? 'Saving' : done ? 'Withdraw vouch' : 'I can vouch'}
    </Button>
  );
}
