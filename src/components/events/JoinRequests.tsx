'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
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
                onClick={() =>
                  startTransition(async () => {
                    await approveJoinRequest(request.inviteId, eventId);
                    router.refresh();
                  })
                }
              >
                Welcome in
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await declineJoinRequest(request.inviteId, eventId);
                    router.refresh();
                  })
                }
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
