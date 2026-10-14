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
import { answerHangAgain } from '@/lib/actions/hang-again';
import { listOf } from '@/lib/match-why';
import { confirmAttendance } from '@/lib/actions/attendance';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/lib/format';
import type { CrewCardData } from '@/lib/server/same-crew';
import { respondToRitual, skipRitual } from '@/lib/actions/rituals';

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
        <p className="text-sm text-ink-soft">Noted, just for you.</p>
      </Card>
    );
  }

  return (
    <Card tone="cream">
      <p className="text-sm font-medium">How did “{eventTitle}” leave you feeling?</p>
      <p className="text-xs text-ink-faint mt-0.5">
        Private. It feeds the energy map in Your Read, which only you see.
      </p>
      <div className="flex gap-2 mt-3">
        {(
          [
            ['filled', 'Filled up'],
            ['neutral', 'Fine'],
            ['drained', 'Drained'],
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
  /**
   * Up to three things both of you picked, shown before either name is. Empty
   * when either of you hides interests from discovery.
   */
  shared: string[];
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
            <Button size="sm">Say hi</Button>
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
      {proposal.shared.length > 0 && (
        <p className="text-sm text-ink-soft mt-1.5">
          You both picked{' '}
          <strong className="text-ink">{listOf(proposal.shared)}</strong>.
        </p>
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
  /** The due date being nudged about, so Skip moves exactly this one. */
  dueOn: string | null;
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
            Love it
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
    const dueOn = ritual.dueOn;
    return (
      <Card tone="terracotta">
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={ritual.otherName} seed={ritual.otherId} size="sm" />
          <p className="text-sm flex-1 min-w-[10rem]">
            Time for your <strong>{ritual.activity.toLowerCase()}</strong> ritual
            with <strong>{ritual.otherName}</strong>.
          </p>
          <div className="flex items-center gap-1.5">
            {dueOn && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    try {
                      const result = await skipRitual(ritual.id, dueOn);
                      if (!result.ok) {
                        toast.error(result.error ?? 'Could not skip it. Try again.', result.code);
                      } else {
                        toast.success(`Skipped. The next one is due in about ${ritual.cadenceDays} days.`);
                      }
                      router.refresh();
                    } catch {
                      toast.error('Could not skip it. Try again.');
                    }
                  })
                }
              >
                Skip
              </Button>
            )}
            <Link
              href={`/events/new?title=${encodeURIComponent(ritual.activity)}&ritual=${ritual.id}&invite=${ritual.otherId}`}
            >
              <Button size="sm">Plan it</Button>
            </Link>
          </div>
        </div>
      </Card>
    );
  }

  return null;
}

/* "Hang out again?" about one person from a finished plan. Private both ways. */
export interface HangAgainCardData {
  eventId: string;
  eventTitle: string;
  personId: string;
  personName: string;
}

export function HangAgainCard({ prompt }: { prompt: HangAgainCardData }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<null | { yes: boolean; matched: boolean; url?: string }>(null);
  const toast = useToast();

  function answer(yes: boolean) {
    startTransition(async () => {
      try {
        const res = await answerHangAgain(prompt.eventId, prompt.personId, yes);
        if (!res.ok) {
          toast.error(res.error ?? 'Could not save that. Try again.', res.code);
          return;
        }
        setResult({ yes, matched: Boolean(res.matched), url: res.url });
      } catch {
        toast.error('Could not save that. Try again.');
      }
    });
  }

  if (result?.matched) {
    return (
      <Card tone="sage" className="animate-rise">
        <p className="text-sm">
          <strong>{prompt.personName}</strong> wants to hang out again too.
        </p>
        {result.url && (
          <Link href={result.url} className="inline-block mt-2">
            <Button size="sm">Say hi</Button>
          </Link>
        )}
      </Card>
    );
  }

  if (result) {
    return (
      <Card tone="cream" className="animate-rise">
        <p className="text-sm text-ink-soft">
          {result.yes
            ? 'Noted. If they say yes too, you’ll both find out.'
            : 'Got it. They won’t know.'}
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-3">
        <Avatar name={prompt.personName} seed={prompt.personId} size="sm" />
        <p className="text-sm flex-1">
          You and <strong>{prompt.personName}</strong> were both at{' '}
          <strong>{prompt.eventTitle}</strong>. Hang out again?
        </p>
      </div>
      <div className="flex gap-2 mt-3">
        <Button
          variant="accept"
          size="sm"
          className="flex-1"
          disabled={pending}
          onClick={() => answer(true)}
        >
          I’d like that
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={pending}
          onClick={() => answer(false)}
        >
          Not really
        </Button>
      </div>
    </Card>
  );
}

/* "Still coming?" in the day and a half before an Open Table. */
export interface AttendanceCheckData {
  inviteId: string;
  eventId: string;
  title: string;
  startsAt: string;
  timeZone: string | null;
}

export function AttendanceCard({ check }: { check: AttendanceCheckData }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState<null | 'confirmed' | 'released'>(null);
  const toast = useToast();
  const confirm = useConfirm();

  async function answer(coming: boolean) {
    if (!coming) {
      const ok = await confirm({
        title: 'Give your seat back?',
        body: 'The host hears that a seat opened, and it goes to the next person waiting. You can’t take it back after.',
        confirmLabel: 'Give it back',
        danger: true,
      });
      if (!ok) return;
    }
    startTransition(async () => {
      try {
        const res = await confirmAttendance(check.inviteId, coming);
        if (!res.ok) {
          toast.error(res.error ?? 'Could not save that. Try again.', res.code);
          return;
        }
        setDone(res.outcome ?? 'confirmed');
      } catch {
        toast.error('Could not save that. Try again.');
      }
    });
  }

  if (done) {
    return (
      <Card tone="cream" className="animate-rise">
        <p className="text-sm text-ink-soft">
          {done === 'confirmed'
            ? 'See you there.'
            : 'Thanks for saying so. Your seat went back to the table.'}
        </p>
      </Card>
    );
  }

  return (
    <Card tone="gold">
      <p className="text-sm">
        Still coming to{' '}
        <Link href={`/events/${check.eventId}`} className="font-bold hover:underline">
          {check.title}
        </Link>
        ?
      </p>
      <p className="text-xs text-ink-faint mt-0.5">
        {formatDateTime(check.startsAt, check.timeZone)}. The host is counting
        seats, and someone may be waiting for one.
      </p>
      <div className="flex gap-2 mt-3">
        <Button
          variant="accept"
          size="sm"
          className="flex-1"
          disabled={pending}
          onClick={() => void answer(true)}
        >
          I’ll be there
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="flex-1"
          disabled={pending}
          onClick={() => void answer(false)}
        >
          Can’t make it
        </Button>
      </div>
    </Card>
  );
}

/* Two or more people from one plan who all want to hang out again with you. */
export function SameCrewCard({ crew }: { crew: CrewCardData }) {
  const names = crew.members.map((member) => member.name.split(' ')[0]);
  return (
    <Card tone="sage">
      <p className="text-xs uppercase tracking-wide text-sage-deep font-medium">
        Same crew again?
      </p>
      <p className="text-sm mt-1.5">
        You, {listOf(names)} all said yes to hanging out again after{' '}
        <strong>{crew.eventTitle}</strong>.
      </p>
      <div className="flex -space-x-2 mt-2" aria-hidden>
        {crew.members.map((member) => (
          <Avatar key={member.id} name={member.name} seed={member.id} size="sm" />
        ))}
      </div>
      <Link href={crew.href} className="inline-block mt-3">
        <Button size="sm">Plan something with them</Button>
      </Link>
    </Card>
  );
}
