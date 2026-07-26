'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { respondViaShareLink } from '@/lib/actions/invites';

interface ShareLinkRsvpProps {
  shareToken: string;
  /** The signed-in viewer's profile name, when they have one. */
  defaultName: string;
}

/**
 * The answer buttons on a plan's public share link, for a signed-in viewer.
 * Signed-out visitors get `RsvpSignInGate` instead — reading the plan is open to
 * anyone with the link, answering it takes an account.
 *
 * The host sees the responder's profile name (resolved server-side, not posted
 * from here); the name field only appears for the rare account that has none
 * yet, so an answer never reaches a host as an anonymous row.
 *
 * On success the responder is handed off to their own `/rsvp/<token>` page: the
 * durable per-person link they can reopen to add the plan to a calendar or
 * change their answer, and the same surface a directly-invited guest gets.
 */
export function ShareLinkRsvp({ shareToken, defaultName }: ShareLinkRsvpProps) {
  const [name, setName] = useState(defaultName);
  const [error, setError] = useState('');
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const needsName = defaultName.trim().length === 0;

  function respond(accept: boolean) {
    const trimmed = name.trim();
    if (needsName && !trimmed) {
      setError('Please add your name so the host knows who’s coming.');
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await respondViaShareLink(shareToken, accept, trimmed);
      if (!result.ok || !result.token) {
        // A session can lapse while an invitation sits open in a tab. Say so and
        // offer the way back, rather than a dead-end "something went wrong".
        setSignInNeeded(result.outcome === 'auth_required');
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
      {needsName && (
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
          {signInNeeded && (
            <>
              {' '}
              <Link
                href={`/login?next=${encodeURIComponent(`/i/${shareToken}`)}`}
                className="font-bold underline"
              >
                Sign in
              </Link>
            </>
          )}
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
    </div>
  );
}
