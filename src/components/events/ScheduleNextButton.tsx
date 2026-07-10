'use client';

import { useTransition } from 'react';
import { Button } from '@/components/ui/Button';
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
  return (
    <Button
      type="button"
      className="w-full"
      disabled={pending}
      onClick={() => startTransition(() => scheduleNextOccurrence(eventId))}
    >
      {pending ? 'Setting it up…' : `🔁 ${label}`}
    </Button>
  );
}
