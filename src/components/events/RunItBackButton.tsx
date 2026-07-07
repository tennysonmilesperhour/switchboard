'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { runItBack } from '@/lib/actions/events';

/** One tap re-invites the same people to a fresh plan (minus the "not my thing" crowd). */
export function RunItBackButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(() => runItBack(eventId))}
    >
      {pending ? 'Setting it up…' : '🔁 Run it back'}
    </Button>
  );
}
