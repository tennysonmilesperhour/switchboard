'use client';

import { SectionHeader } from '@/components/ui/Card';
import type { RequestRow } from './types';

interface OutgoingRequestsSectionProps {
  outgoing: RequestRow[];
  pending: boolean;
  resendOutgoing: (request: RequestRow) => void;
  cancelOutgoing: (request: RequestRow) => void;
}

export function OutgoingRequestsSection({
  outgoing,
  pending,
  resendOutgoing,
  cancelOutgoing,
}: OutgoingRequestsSectionProps) {
  if (outgoing.length === 0) return null;
  return (
    <section>
      <SectionHeader
        title="Waiting to hear back"
        hint="Nudge someone who hasn’t responded, or cancel the request"
      />
      <ul className="space-y-1.5">
        {outgoing.map((request) => (
          <li
            key={request.connectionId}
            className="flex items-center gap-3 rounded-card bg-cream px-3.5 py-2.5 text-sm"
          >
            <span className="flex-1 min-w-0">
              <strong>{request.name}</strong>{' '}
              <span className="text-ink-faint">@{request.handle}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              className="shrink-0 rounded-pill px-2 py-1 text-xs font-semibold text-terracotta-deep hover:text-terracotta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              onClick={() => resendOutgoing(request)}
            >
              Resend
            </button>
            <button
              type="button"
              disabled={pending}
              className="shrink-0 rounded-pill px-2 py-1 text-xs text-ink-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              onClick={() => cancelOutgoing(request)}
            >
              Cancel
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
