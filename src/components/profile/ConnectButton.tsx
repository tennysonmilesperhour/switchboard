'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import {
  acceptConnection,
  sendConnectionRequestToId,
} from '@/lib/actions/connections';
import type { RelationshipStatus } from '@/lib/server/relationship';

interface ConnectButtonProps {
  targetId: string;
  name: string;
  status: RelationshipStatus;
  /** Needed to accept an incoming request in place. */
  connectionId?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * One-tap connection control reused wherever another person is shown (event
 * host card, public profile). It reflects the four relationship states and,
 * because the request/accept succeeds silently, tells the user what happened
 * in text — not color alone.
 */
export function ConnectButton({
  targetId,
  name,
  status,
  connectionId,
  size = 'sm',
  className = '',
}: ConnectButtonProps) {
  // Track locally so the control updates immediately after an action without a
  // full server round-trip feeling laggy; router.refresh() reconciles the rest.
  const [localStatus, setLocalStatus] = useState<RelationshipStatus>(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (localStatus === 'self') return null;

  if (localStatus === 'accepted') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-pill bg-sage-soft px-3 py-1.5 text-xs font-bold text-sage-deep ${className}`}
      >
        <Icon name="check" size={14} />
        Friends
      </span>
    );
  }

  if (localStatus === 'outgoing') {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-pill bg-cream px-3 py-1.5 text-xs font-bold text-ink-soft ${className}`}
      >
        Request sent
      </span>
    );
  }

  if (localStatus === 'incoming') {
    return (
      <Button
        type="button"
        size={size}
        variant="accept"
        className={className}
        disabled={pending || !connectionId}
        onClick={() =>
          startTransition(async () => {
            if (!connectionId) return;
            const result = await acceptConnection(connectionId);
            if (!result.ok) {
              toast.error(result.error ?? 'Could not accept. Try again.');
              return;
            }
            setLocalStatus('accepted');
            toast.success(`You’re connected with ${name}.`);
            router.refresh();
          })
        }
      >
        Accept request
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size={size}
      variant="secondary"
      className={className}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await sendConnectionRequestToId(targetId);
          if (!result.ok) {
            toast.error(result.error ?? 'Could not send that request.');
            return;
          }
          setLocalStatus('outgoing');
          toast.success(`Request sent to ${name}.`);
          router.refresh();
        })
      }
    >
      <Icon name="add" size={16} />
      Add friend
    </Button>
  );
}
