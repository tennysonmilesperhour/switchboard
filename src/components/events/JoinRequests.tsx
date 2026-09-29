'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { approveJoinRequest, declineJoinRequest } from '@/lib/actions/invites';

export interface JoinRequestRow {
  inviteId: string;
  name: string;
  userId: string;
}

export function JoinRequests({
  requests,
  eventId,
}: {
  requests: JoinRequestRow[];
  eventId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  /**
   * Approve, and say what approving actually did. On a full plan the database
   * waitlists instead of accepting, and the card vanishing either way read as
   * "they're in" — so the host told someone they had a seat they didn't.
   */
  function approve(request: JoinRequestRow) {
    startTransition(async () => {
      const result = await approveJoinRequest(request.inviteId, eventId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not approve that request.', result.code);
      } else if (result.outcome === 'waitlisted') {
        toast.info(`The plan is full, so ${request.name} is on the waitlist.`);
      } else if (result.outcome === 'gone') {
        toast.info('That request was already answered.');
      } else {
        toast.success(`${request.name} is in.`);
      }
      router.refresh();
    });
  }

  function decline(request: JoinRequestRow) {
    startTransition(async () => {
      const result = await declineJoinRequest(request.inviteId, eventId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not decline that request.', result.code);
      }
      router.refresh();
    });
  }

  if (requests.length === 0) return null;

  return (
    <section>
      <SectionHeader
        title="Asked to join"
        hint="Friends of your guests found this through Open Table"
      />
      <div className="space-y-2">
        {requests.map((request) => (
          <Card key={request.inviteId} tone="gold" lifted>
            <div className="flex items-center gap-3">
              <Avatar name={request.name} seed={request.userId} size="sm" ring />
              <span className="font-bold flex-1">{request.name}</span>
              <Button
                size="sm"
                variant="accept"
                disabled={pending}
                onClick={() => approve(request)}
              >
                Welcome in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => decline(request)}
              >
                Not this time
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
