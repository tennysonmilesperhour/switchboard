'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { respondToGuestInvite } from '@/lib/actions/invites';

interface GuestRsvpClientProps {
  token: string;
  guestName: string;
  initialStatus: string;
}

export function GuestRsvpClient({
  token,
  guestName,
  initialStatus,
}: GuestRsvpClientProps) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  function respond(accept: boolean) {
    startTransition(async () => {
      const result = await respondToGuestInvite(token, accept);
      if (!result.ok) {
        setError(result.error ?? 'Something went wrong');
        if (result.outcome) setStatus(result.outcome);
        return;
      }
      setStatus(result.outcome ?? (accept ? 'accepted' : 'declined'));
    });
  }

  if (status === 'accepted') {
    return (
      <div className="mt-8 rounded-card bg-sage-soft p-5 animate-rise">
        <p className="font-bold text-sage-deep inline-flex items-center gap-1.5">
          <span className="inline-flex items-center justify-center size-5 rounded-full bg-sage text-white">
            <Icon name="check" size={13} />
          </span>
          You’re in, {guestName}!
        </p>
        <p className="text-sm text-ink-soft mt-1">
          The host has been told. See you there.
        </p>
      </div>
    );
  }
  if (status === 'declined') {
    return (
      <div className="mt-8 rounded-card bg-cream p-5 animate-rise">
        <p className="font-bold">No worries 💛</p>
        <p className="text-sm text-ink-soft mt-1">
          The invitation will quietly move along. Nobody’s feelings were harmed
          in the making of this RSVP.
        </p>
      </div>
    );
  }
  if (status === 'waitlisted') {
    return (
      <div className="mt-8 rounded-card bg-gold-soft p-5 animate-rise">
        <p className="font-bold">The event filled up, you’re on the waitlist</p>
        <p className="text-sm text-ink-soft mt-1">
          If a spot opens, the host will reach out.
        </p>
      </div>
    );
  }
  if (status !== 'sent') {
    return (
      <div className="mt-8 rounded-card bg-cream p-5">
        <p className="font-bold">This invitation’s window has passed</p>
        <p className="text-sm text-ink-soft mt-1">
          It quietly moved to the next person - that’s how Switchboard keeps
          plans pressure-free.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {error && (
        <p role="alert" className="text-sm text-rose-deep mb-3">{error}</p>
      )}
      <div className="flex gap-3">
        <Button
          variant="accept"
          size="lg"
          className="flex-1"
          disabled={pending}
          onClick={() => respond(true)}
        >
          <Icon name="check" size={18} />
          I’m in
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          disabled={pending}
          onClick={() => respond(false)}
        >
          Can’t make it
        </Button>
      </div>
    </div>
  );
}
