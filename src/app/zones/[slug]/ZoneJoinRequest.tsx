'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { requestToJoinZone, withdrawZoneRequest } from '@/lib/actions/zones';
import { formatDate } from '@/lib/format';
import { ZONE_REASK_DAYS, type ZoneRequestState } from '@/lib/zone-rules';

interface ZoneJoinRequestProps {
  zoneId: string;
  zoneName: string;
  /** Where the viewer stands, from their own request row (RLS-readable). */
  initialState: ZoneRequestState;
}

/**
 * What someone sees at a private zone's address when they aren't in it.
 *
 * The alternative was a 404, which is the same answer a zone that never existed
 * gets — so a person handed the URL by a friend, before anyone sent them the
 * join link, had no way forward and no way to tell which of the two had
 * happened. A door you can knock on is the smallest honest answer. Nothing
 * beyond the zone's name is on this page.
 *
 * And it says what is true. Someone the organizer passed on, or removed, used
 * to see "Ask to join" again, ask, and be told "Asked" while the old decision
 * quietly swallowed it. Now they see the decision, when they may ask again
 * (once, 30 days on — D10), and the database gives the same answer if asked.
 */
export function ZoneJoinRequest({ zoneId, zoneName, initialState }: ZoneJoinRequestProps) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState<ZoneRequestState>(initialState);
  const [note, setNote] = useState('');
  const toast = useToast();
  const router = useRouter();

  function ask() {
    startTransition(async () => {
      const result = await requestToJoinZone(zoneId, note);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not send that request.', result.code);
        return;
      }
      switch (result.outcome) {
        case 'pending':
          setState({ kind: 'pending' });
          toast.success('Asked. You’ll get a notification when they answer.');
          return;
        case 'member':
        case 'unavailable':
          // Let in by link in the meantime, or the zone stopped being private:
          // either way the page behind the door is now the right answer.
          router.refresh();
          return;
        case 'wait': {
          const reason = state.kind === 'reask' || state.kind === 'wait' ? state.reason : 'denied';
          setState({ kind: 'wait', reason, retryAfter: result.retryAfter ?? new Date().toISOString() });
          return;
        }
        case 'closed': {
          const reason = state.kind === 'reask' || state.kind === 'wait' ? state.reason : 'denied';
          setState({ kind: 'closed', reason });
          return;
        }
        default:
          router.refresh();
      }
    });
  }

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawZoneRequest(zoneId);
      if (!result.ok) {
        toast.error(result.error ?? 'Could not withdraw that request.', result.code);
        return;
      }
      setState({ kind: 'none' });
      toast.success('Request withdrawn. The organizer won’t see it any more.');
    });
  }

  const askForm = (
    <>
      <input
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={280}
        aria-label="Add a note for the organizer"
        placeholder="Add a note (optional)"
        className="mt-4 w-full rounded-card border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-terracotta"
      />
      <Button type="button" className="mt-2.5 w-full" disabled={pending} onClick={ask}>
        {state.kind === 'reask' ? 'Ask once more' : 'Ask to join'}
      </Button>
    </>
  );

  const decided = (reason: 'denied' | 'removed') =>
    reason === 'removed'
      ? 'You were removed from this zone.'
      : 'The organizer passed on your request.';

  return (
    <Card className="text-center" aria-busy={pending}>
      <p className="text-4xl" aria-hidden>
        🔒
      </p>
      <h2 className="mt-3 font-display text-xl text-ink">{zoneName} is private</h2>

      {state.kind === 'none' && (
        <>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            Only people the organizer has let in can see who’s here. You can ask
            to join, or use an invite link if someone sent you one.
          </p>
          {askForm}
        </>
      )}

      {state.kind === 'pending' && (
        <>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            You’ve asked to join. The organizer has been told, and you’ll get a
            notification when they answer — either way.
          </p>
          <div className="mt-4 flex flex-col items-center gap-1">
            <Link
              href="/zones"
              className="inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
            >
              Back to zones
            </Link>
            <button
              type="button"
              onClick={withdraw}
              disabled={pending}
              className="inline-flex min-h-11 items-center rounded-pill px-3 text-xs font-semibold text-ink-faint hover:text-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
            >
              Withdraw my request
            </button>
          </div>
        </>
      )}

      {state.kind === 'reask' && (
        <>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
            {decided(state.reason)} It’s been {ZONE_REASK_DAYS} days, so you can ask
            once more. If they pass again, that’s their answer.
          </p>
          {askForm}
        </>
      )}

      {state.kind === 'wait' && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          {decided(state.reason)} You can ask once more from{' '}
          <strong className="text-ink">{formatDate(state.retryAfter)}</strong>, or join
          straight away with an invite link if someone in the zone sends you one.
        </p>
      )}

      {state.kind === 'closed' && (
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-soft">
          {decided(state.reason)} You’ve already asked again once, so there’s no
          request left to send. An invite link from someone in the zone still works.
        </p>
      )}

      {state.kind !== 'none' && state.kind !== 'pending' && (
        <Link
          href="/zones"
          className="mt-4 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
        >
          Back to zones
        </Link>
      )}
    </Card>
  );
}
