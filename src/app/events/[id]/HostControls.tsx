'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { cancelEvent, confirmEvent, startInviting } from '@/lib/actions/events';
import type { SwitchboardEvent } from '@/lib/types';

interface HostControlsProps {
  event: SwitchboardEvent;
  pollDecided: boolean;
}

export function HostControls({ event, pollDecided }: HostControlsProps) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<void>) {
    startTransition(async () => {
      await action();
      router.refresh();
    });
  }

  if (event.status === 'cancelled' || event.status === 'past') return null;

  return (
    <section className="border-t border-line pt-5 space-y-2.5">
      {event.status === 'deciding' && (
        <Button
          className="w-full"
          disabled={pending || !pollDecided}
          onClick={() => run(() => startInviting(event.id))}
        >
          {pollDecided
            ? 'Send the invitations 🪜'
            : 'Waiting for the group to decide…'}
        </Button>
      )}
      {event.status === 'inviting' && (
        <Button
          variant="accept"
          className="w-full"
          disabled={pending}
          onClick={() => run(() => confirmEvent(event.id))}
        >
          Lock it in - confirm the plan ✓
        </Button>
      )}
      <Button
        variant="ghost"
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (window.confirm('Cancel this plan? Everyone accepted will be notified.')) {
            run(() => cancelEvent(event.id));
          }
        }}
      >
        Cancel this plan
      </Button>
    </section>
  );
}
