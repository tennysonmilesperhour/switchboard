'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { respondViaShareLink } from '@/lib/actions/invites';

interface ShareLinkRsvpProps {
  shareToken: string;
  /** Prefilled for a signed-in viewer; empty for a stranger. */
  defaultName: string;
  authed: boolean;
}

/**
 * RSVP straight from a plan's public share link — no account, no waiting on the
 * host to approve. The only thing asked of a stranger is a name, so the host
 * knows who is coming.
 *
 * On success the responder is handed off to their own `/rsvp/<token>` page: the
 * durable per-person link they can reopen to add the plan to a calendar or
 * change their answer, and the same surface a directly-invited guest gets.
 */
export function ShareLinkRsvp({ shareToken, defaultName, authed }: ShareLinkRsvpProps) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function respond(accept: boolean) {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please add your name so the host knows who’s coming.');
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await respondViaShareLink(shareToken, accept, trimmed);
      if (!result.ok || !result.token) {
        setError(result.error ?? 'Something went wrong. Try again.');
        return;
      }
      // Their own RSVP page shows the outcome (in, waitlisted, or declined) and
      // stays valid afterwards.
      router.push(`/rsvp/${result.token}`);
    });
  }

  return (
    <div className="mt-8">
      {!authed && (
        <label className="block mb-4">
          <span className="block text-sm font-bold text-ink mb-1.5">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={pending}
            maxLength={80}
            autoComplete="name"
            placeholder="First name is plenty"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-deep mb-3">
          {error}
        </p>
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
      {!authed && (
        <p className="text-xs text-ink-faint mt-3 text-center">
          No account needed. You can make one later if you want the plan in your app.
        </p>
      )}
    </div>
  );
}
