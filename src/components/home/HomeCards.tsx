'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { useToast } from '@/components/ui/Toast';
import { logEnergy, type Feeling } from '@/lib/actions/energy';
import { respondToIntroduction } from '@/lib/actions/matchmaker';
import { respondToRitual } from '@/lib/actions/rituals';

/* One-tap private reflection after an event. */
export function EnergyPrompt({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function log(feeling: Feeling) {
    startTransition(async () => {
      try {
        const result = await logEnergy(eventId, feeling);
        if (!result.ok) {
          toast.error(result.error ?? 'Could not save that. Try again.', result.code);
          return;
        }
        setDone(true);
      } catch {
        toast.error('Could not save that. Try again.');
      }
    });
  }

  if (done) {
    return (
      <Card tone="cream" className="animate-rise">
        <p className="text-sm text-ink-soft">Noted, just for you. 🤍</p>
      </Card>
    );
  }

  return (
    <Card tone="cream">
      <p className="text-sm font-medium">How did “{eventTitle}” leave you feeling?</p>
      <p className="text-xs text-ink-faint mt-0.5">
        Private. Helps Switchboard pace your suggestions.
      </p>
      <div className="flex gap-2 mt-3">
        {(
          [
            ['filled', '🔋 Filled up'],
            ['neutral', '😌 Fine'],
            ['drained', '🪫 Drained'],
          ] as Array<[Feeling, string]>
        ).map(([feeling, label]) => (
          <button
            key={feeling}
            type="button"
            disabled={pending}
            onClick={() => log(feeling)}
            className="flex-1 rounded-pill border border-line bg-card py-2 text-xs font-medium hover:border-ink-faint active:scale-95 transition-all"
          >
            {label}
          </button>
        ))}
      </div>
    </Card>
  );
}

/* Masked matchmaker proposal, from the recipient's side. */
export interface ProposalCardData {
  id: string;
  activity: string;
  note: string | null;
  proposerName: string;
  myResponse: string;
  status: string;
  roomId: string | null;
  otherName: string | null;
}

export function MatchmakerCard({ proposal }: { proposal: ProposalCardData }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (proposal.status === 'matched') {
    return (
      <Card tone="sage" className="animate-rise">
        <p className="text-sm">
          <strong>{proposal.proposerName}</strong> introduced you and{' '}
          <strong>{proposal.otherName}</strong>. You both said yes to{' '}
          <strong>{proposal.activity.toLowerCase()}</strong>.
        </p>
        {proposal.roomId && (
          <Link href={`/rooms/${proposal.roomId}`} className="inline-block mt-2">
            <Button size="sm">Say hi 💬</Button>
          </Link>
        )}
      </Card>
    );
  }

  if (proposal.myResponse === 'accepted') {
    return (
      <Card tone="gold">
        <p className="text-sm text-ink-soft">
          You said yes to {proposal.proposerName}’s introduction. If the other
          person does too, you’ll both find out.
        </p>
      </Card>
    );
  }

  return (
    <Card tone="gold" lifted>
      <p className="text-xs uppercase tracking-wide text-terracotta-deep font-medium">
        A friend playing matchmaker
      </p>
      <p className="text-sm mt-1.5">
        <strong>{proposal.proposerName}</strong> thinks you and someone they
        know would hit it off over{' '}
        <strong>{proposal.activity.toLowerCase()}</strong>.
      </p>
      {proposal.note && (
        <p className="text-sm text-ink-soft mt-1">“{proposal.note}”</p>
      )}
      <p className="text-xs text-ink-faint mt-1.5">
        Who? Only revealed if you both say yes. A no is never seen by anyone.
      </p>
      <div className="flex gap-2 mt-3">
        <Button
          variant="accept"
          size="sm"
          className="flex-1"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await respondToIntroduction(proposal.id, true);
              if (!result.ok) {
                toast.error(result.error ?? 'Could not respond. Try again.', result.code);
                return;
              }
              router.refresh();
            })
          }
        >
          I’m curious
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await respondToIntroduction(proposal.id, false);
              if (!result.ok) {
                toast.error(result.error ?? 'Could not respond. Try again.', result.code);
                return;
              }
              router.refresh();
            })
          }
        >
          Not for me
        </Button>
      </div>
    </Card>
  );
}

/* Ritual nudge + pending ritual invitations. */
export interface RitualCardData {
  id: string;
  activity: string;
  otherName: string;
  otherId: string;
  cadenceDays: number;
  status: string;
  isMine: boolean;
  due: boolean;
}

export function RitualCard({ ritual }: { ritual: RitualCardData }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  if (ritual.status === 'proposed' && !ritual.isMine) {
    return (
      <Card tone="gold" lifted>
        <p className="text-sm">
          <strong>{ritual.otherName}</strong> wants to make{' '}
          <strong>{ritual.activity.toLowerCase()}</strong> a regular thing,
          about every {ritual.cadenceDays} days.
        </p>
        <div className="flex gap-2 mt-3">
          <Button
            variant="accept"
            size="sm"
            className="flex-1"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await respondToRitual(ritual.id, true);
                  if (!result.ok) {
                    toast.error(result.error ?? 'Could not respond. Try again.', result.code);
                    return;
                  }
                  router.refresh();
                } catch {
                  toast.error('Could not respond. Try again.');
                }
              })
            }
          >
            Love it 🔁
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const result = await respondToRitual(ritual.id, false);
                  if (!result.ok) {
                    toast.error(result.error ?? 'Could not respond. Try again.', result.code);
                    return;
                  }
                  router.refresh();
                } catch {
                  toast.error('Could not respond. Try again.');
                }
              })
            }
          >
            Not now
          </Button>
        </div>
      </Card>
    );
  }

  if (ritual.status === 'active' && ritual.due) {
    return (
      <Card tone="terracotta">
        <div className="flex items-center gap-3">
          <Avatar name={ritual.otherName} seed={ritual.otherId} size="sm" />
          <p className="text-sm flex-1">
            Time for your <strong>{ritual.activity.toLowerCase()}</strong> ritual
            with <strong>{ritual.otherName}</strong>.
          </p>
          <Link
            href={`/events/new?title=${encodeURIComponent(ritual.activity)}&ritual=${ritual.id}&invite=${ritual.otherId}`}
          >
            <Button size="sm">Plan it</Button>
          </Link>
        </div>
      </Card>
    );
  }

  return null;
}
