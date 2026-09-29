'use client';

import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card, SectionHeader } from '@/components/ui/Card';
import type { RequestRow } from './types';

interface IncomingRequestsSectionProps {
  incoming: RequestRow[];
  pending: boolean;
  acceptRequest: (request: RequestRow) => void;
  ignoreRequest: (request: RequestRow) => void;
  reportRequest: (request: RequestRow) => void;
  blockRequest: (request: RequestRow) => Promise<void>;
}

export function IncomingRequestsSection({
  incoming,
  pending,
  acceptRequest,
  ignoreRequest,
  reportRequest,
  blockRequest,
}: IncomingRequestsSectionProps) {
  if (incoming.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Wants to connect" />
      <div className="space-y-2">
        {incoming.map((request) => (
          <Card key={request.connectionId} tone="gold">
            {/* Wraps: a name plus four controls does not fit one 320px row,
                so the buttons drop below the name instead of overflowing. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <Avatar name={request.name} seed={request.id} size="sm" />
              <span className="min-w-0 flex-1 basis-32">
                <span className="font-bold block truncate">{request.name}</span>
                {request.handle && (
                  <span className="block truncate text-xs text-ink-faint">@{request.handle}</span>
                )}
              </span>
              <Button
                size="sm"
                variant="accept"
                disabled={pending}
                onClick={() => acceptRequest(request)}
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => ignoreRequest(request)}
              >
                Ignore
              </Button>
              <button
                type="button"
                disabled={pending}
                onClick={() => reportRequest(request)}
                className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                Report
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => blockRequest(request)}
                className="rounded-pill px-2 py-1 text-xs font-semibold text-rose-deep hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                Block
              </button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
