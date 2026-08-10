'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { resolveParentalApproval } from '@/lib/actions/parental-approval';

interface ApproveClientProps {
  token: string;
  eventTitle: string;
  guardianName: string | null;
}

export function ApproveClient({ token, eventTitle, guardianName }: ApproveClientProps) {
  const [result, setResult] = useState<{ outcome?: string; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function handle(approve: boolean) {
    startTransition(async () => {
      const res = await resolveParentalApproval(token, approve);
      setResult(res);
    });
  }

  if (result?.outcome === 'approved') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-card bg-sage-soft p-6">
          <p className="text-lg font-bold text-sage-deep">Approved</p>
          <p className="text-sm text-ink-soft mt-2">
            You've approved attendance for <strong>{eventTitle}</strong>. The host has been notified.
          </p>
        </div>
      </div>
    );
  }

  if (result?.outcome === 'denied') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-card bg-cream p-6">
          <p className="text-lg font-bold">Denied</p>
          <p className="text-sm text-ink-soft mt-2">
            You've denied attendance for <strong>{eventTitle}</strong>. The host has been notified.
          </p>
        </div>
      </div>
    );
  }

  if (result?.outcome === 'already_resolved') {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-card bg-cream p-6">
          <p className="text-lg font-bold">Already handled</p>
          <p className="text-sm text-ink-soft mt-2">{result.error}</p>
        </div>
      </div>
    );
  }

  if (result && !result.outcome) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-card bg-rose-soft p-6">
          <p className="text-lg font-bold text-rose-deep">Something went wrong</p>
          <p className="text-sm text-ink-soft mt-2">{result.error ?? 'Please try again.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-card bg-card p-6 shadow-lift text-center">
        <p className="text-lg font-bold">Guardian Approval</p>
        <p className="text-sm text-ink-soft mt-2">
          {guardianName ? `Hi ${guardianName}, s` : 'S'}omeone has RSVP'd to{' '}
          <strong>{eventTitle}</strong> and the host has asked that a parent or
          guardian approve their attendance.
        </p>
        {pending && <p className="text-sm text-ink-faint mt-3">Processing...</p>}
        <div className="flex gap-3 mt-6">
          <Button
            variant="accept"
            size="lg"
            className="flex-1"
            disabled={pending}
            onClick={() => handle(true)}
          >
            <Icon name="check" size={18} />
            Approve
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="flex-1"
            disabled={pending}
            onClick={() => handle(false)}
          >
            Deny
          </Button>
        </div>
      </div>
    </div>
  );
}
