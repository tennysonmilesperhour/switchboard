'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { respondToInvite } from '@/lib/actions/invites';
import { formatRelative } from '@/lib/format';

interface RsvpCardProps {
  inviteId: string;
  expiresAtIso: string | null;
}

/** Invitee accept/decline with graceful decline options that teach. */
export function RsvpCard({ inviteId, expiresAtIso }: RsvpCardProps) {
  const [declining, setDeclining] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function respond(accept: boolean, note: 'keep_asking' | 'not_my_thing' | null = null) {
    startTransition(async () => {
      const result = await respondToInvite(inviteId, accept, note);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong');
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card tone="gold" lifted className="animate-rise">
      <p className="font-medium">You’re invited 💌</p>
      {expiresAtIso && (
        <p className="text-sm text-ink-soft mt-0.5">
          Respond {formatRelative(expiresAtIso)} — after that the invitation
          quietly moves on. No hard feelings either way.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-deep mt-2">{error}</p>
      )}
      {!declining ? (
        <div className="flex gap-2.5 mt-4">
          <Button
            variant="accept"
            className="flex-1"
            disabled={pending}
            onClick={() => respond(true)}
          >
            I’m in ✓
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            Can’t make it
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2 animate-rise">
          <p className="text-sm text-ink-soft">No problem — which is it?</p>
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => respond(false, 'keep_asking')}
          >
            Can’t this time — keep asking! 💛
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            disabled={pending}
            onClick={() => respond(false, 'not_my_thing')}
          >
            Not really my thing
          </Button>
          <button
            type="button"
            className="w-full text-xs text-ink-faint hover:text-ink pt-1"
            onClick={() => setDeclining(false)}
          >
            Go back
          </button>
        </div>
      )}
    </Card>
  );
}
