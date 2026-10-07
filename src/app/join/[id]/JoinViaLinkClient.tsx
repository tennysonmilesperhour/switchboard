'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { requestToJoin } from '@/lib/actions/open-table';

/**
 * Signed-in visitor asking to join a plan from its shared invite link. Uses the
 * same request-to-join flow as an open table, so the host approves every ask.
 */
export function JoinViaLinkClient({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [asked, setAsked] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function ask() {
    startTransition(async () => {
      const result = await requestToJoin(eventId);
      if (result.ok) {
        setAsked(true);
      } else {
        toast.error(result.error ?? 'Could not send your request.', result.code);
      }
    });
  }

  if (asked) {
    return (
      <div className="rounded-card bg-sage-soft p-5">
        <p className="font-extrabold text-lg text-sage-deep">You’re on the list to join</p>
        <p className="text-sm text-ink-soft mt-1">
          {eventTitle}’s host will get your request and let you know. You can
          follow along on the plan page.
        </p>
        <Link href={`/events/${eventId}`} className="mt-4 block">
          <Button variant="secondary" size="lg" className="w-full">
            See the plan
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <Button size="lg" className="w-full" disabled={pending} onClick={ask}>
      {pending ? 'Sending…' : 'Ask to join'}
    </Button>
  );
}
