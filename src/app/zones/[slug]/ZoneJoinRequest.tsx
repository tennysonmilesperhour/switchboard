'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { requestToJoinZone } from '@/lib/actions/zones';

interface ZoneJoinRequestProps {
  zoneId: string;
  zoneName: string;
  alreadyAsked: boolean;
}

/**
 * What someone sees at a private zone's address when they aren't in it.
 *
 * The alternative was a 404, which is the same answer a zone that never existed
 * gets — so a person handed the URL by a friend, before anyone sent them the
 * join link, had no way forward and no way to tell which of the two had
 * happened. A door you can knock on is the smallest honest answer. Nothing
 * beyond the zone's name is on this page.
 */
export function ZoneJoinRequest({ zoneId, zoneName, alreadyAsked }: ZoneJoinRequestProps) {
  const [pending, startTransition] = useTransition();
  const [asked, setAsked] = useState(alreadyAsked);
  const [note, setNote] = useState('');
  const toast = useToast();

  function ask() {
    startTransition(async () => {
      const result = await requestToJoinZone(zoneId, note);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send that request.', result.code);
        return;
      }
      setAsked(true);
      toast.success('Asked. You’ll get a notification when they let you in.');
    });
  }

  return (
    <Card className="text-center" aria-busy={pending}>
      <p className="text-4xl" aria-hidden>
        🔒
      </p>
      <h2 className="mt-3 font-display text-xl text-ink">{zoneName} is private</h2>

      {asked ? (
        <>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            You’ve asked to join. The organizer has been told, and you’ll get
            a notification when they let you in.
          </p>
          <Link
            href="/zones"
            className="mt-5 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
          >
            Back to zones
          </Link>
        </>
      ) : (
        <>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            Only people the organizer has let in can see who’s here. You can ask
            to join, or use an invite link if someone sent you one.
          </p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={280}
            aria-label="Add a note for the organizer"
            placeholder="Add a note (optional)"
            className="mt-4 w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
          />
          <Button
            type="button"
            className="mt-2.5 w-full"
            disabled={pending}
            onClick={ask}
          >
            Ask to join
          </Button>
        </>
      )}
    </Card>
  );
}
