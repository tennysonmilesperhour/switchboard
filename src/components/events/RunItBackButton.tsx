'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { runItBack } from '@/lib/actions/events';

/**
 * One tap starts a fresh plan with the same crew (minus the "not my thing"
 * crowd), opening as a date poll. Success navigates to it; a failure says so,
 * with its code, instead of leaving the host where they were with no word.
 */
export function RunItBackButton({ eventId }: { eventId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await runItBack(eventId);
          if (!result.ok) {
            toast.error(result.error ?? 'Could not set up the new plan.', result.code);
          }
        })
      }
    >
      {pending ? 'Setting it up…' : 'Run it back'}
    </Button>
  );
}
