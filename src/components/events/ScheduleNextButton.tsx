'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { scheduleNextOccurrence } from '@/lib/actions/events';

/** One tap clones a recurring plan forward onto its next date, same crew. */
export function ScheduleNextButton({
  eventId,
  label = 'Schedule the next one',
}: {
  eventId: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      type="button"
      className="w-full"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await scheduleNextOccurrence(eventId);
          if (!result.ok) {
            toast.error(result.error ?? 'Could not set up the next one.', result.code);
          }
        })
      }
    >
      {pending ? 'Setting it up…' : label}
    </Button>
  );
}
