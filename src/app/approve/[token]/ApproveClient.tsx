'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { Icon } from '@/components/ui/Icon';
import {
  resolveParentalApproval,
  type ResolveApprovalResult,
} from '@/lib/actions/parental-approval';
import type { GuardianPlanFacts } from '@/lib/guardian-approval';

interface ApproveClientProps {
  token: string;
  /** Exactly what D2 lets a guardian see: what, when, where, host, and who. */
  facts: GuardianPlanFacts;
  guardianName: string | null;
}

export function ApproveClient({ token, facts, guardianName }: ApproveClientProps) {
  const eventTitle = facts.title;
  const [result, setResult] = useState<ResolveApprovalResult | null>(null);
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
            You&rsquo;ve approved {facts.inviteeName} for <strong>{eventTitle}</strong>.
            {result.inviteStatus === 'waitlisted'
              ? ' It filled up before you answered, so they’re on the waitlist - they and the host have been told.'
              : ' Their RSVP counts now, and they and the host have been told.'}
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
            You&rsquo;ve denied {facts.inviteeName}&rsquo;s RSVP for <strong>{eventTitle}</strong>.
            It no longer counts, and they and the host have been told.
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

  // Every failure lands here, including the ones that carry an outcome (a
  // link for a plan or invitation that has since gone). Keying on a missing
  // outcome sent those back to the Approve/Deny buttons with no message.
  if (result && !result.ok) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="rounded-card bg-rose-soft p-6">
          <ErrorNotice
            message={result.error ?? 'Something went wrong.'}
            fix={result.fix ?? 'Please try again.'}
            code={result.code}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="rounded-card bg-card p-6 shadow-lift text-center">
        <p className="text-lg font-bold">Guardian Approval</p>
        <p className="text-sm text-ink-soft mt-2">
          {guardianName ? `Hi ${guardianName}. ` : ''}
          <strong>{facts.inviteeName}</strong> said yes to this plan, and the
          host has asked that a parent or guardian approve it. Their RSVP
          doesn&rsquo;t count until you answer.
        </p>
        <dl className="mt-4 space-y-2 rounded-card bg-cream px-4 py-3 text-left text-sm">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">What</dt>
            <dd className="font-bold text-ink">{facts.title}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">When</dt>
            <dd className="text-ink">{facts.when}</dd>
          </div>
          {facts.where && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">Where</dt>
              <dd className="text-ink">{facts.where}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-ink-faint">Host</dt>
            <dd className="text-ink">{facts.hostName}</dd>
          </div>
        </dl>
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
