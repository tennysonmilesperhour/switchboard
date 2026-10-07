'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { respondToInvite } from '@/lib/actions/invites';
import { formatRelative } from '@/lib/format';
import { errorFor, errorRef, type ErrorCode } from '@/lib/errors';
import {
  RsvpQuestions,
  requiredAnswered,
  type RsvpQuestion,
} from '@/components/events/RsvpQuestions';

interface RsvpCardProps {
  inviteId: string;
  expiresAtIso: string | null;
  questions?: RsvpQuestion[];
  /**
   * The invitee already said no, and the plan is still inviting (D17). The
   * card offers the yes only — a second no records nothing — behind one tap,
   * so a no stays settled unless they mean to change it.
   */
  reconsider?: boolean;
}

/** Invitee accept/decline with graceful decline options that teach. */
export function RsvpCard({
  inviteId,
  expiresAtIso,
  questions = [],
  reconsider = false,
}: RsvpCardProps) {
  // In reconsider mode the yes stays folded away until they ask for it.
  const [reopened, setReopened] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [declineMessage, setDeclineMessage] = useState('');
  const [error, setError] = useState('');
  // Operational failures carry a code; "answer the required question" doesn't.
  const [errorCode, setErrorCode] = useState<ErrorCode | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const missingRequired = !requiredAnswered(questions, answers);

  function respond(accept: boolean, note: 'keep_asking' | 'not_my_thing' | null = null) {
    if (accept && missingRequired) {
      setErrorCode(null);
      setError('Please answer the required question' + (questions.filter((q) => q.required).length > 1 ? 's' : ''));
      return;
    }
    setError('');
    setErrorCode(null);
    startTransition(async () => {
      try {
        const result = await respondToInvite(
          inviteId,
          accept,
          note,
          accept ? answers : {},
          accept ? '' : declineMessage,
        );
        if (!result.ok) {
          setError(result.error ?? 'Something went wrong');
          setErrorCode(result.code ?? null);
          return;
        }
        // The database keeps a no when the plan has moved on since this page
        // loaded (the list was confirmed), or when the no was a guardian's.
        if (accept && result.outcome === 'declined') {
          setError('This plan isn’t taking new answers, so yours stays as it was. Reload to see where it stands.');
          return;
        }
        router.refresh();
      } catch {
        // A rejected action never reached the branch above, so the tap read
        // as ignored. Say it didn't save, with the code, like any other miss.
        setError(errorFor('SB-RSVP-SAVE').message);
        setErrorCode('SB-RSVP-SAVE');
      }
    });
  }

  if (reconsider && !reopened) {
    return (
      <Card>
        <p className="font-extrabold text-lg">You said you can’t make it</p>
        <p className="text-sm text-ink-soft mt-0.5">
          Plans change. If you can come after all, you can say so while
          invitations are still going out.
        </p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setReopened(true)}>
          Actually, I can come
        </Button>
      </Card>
    );
  }

  return (
    <Card tone="gold" lifted className="animate-rise">
      <p className="font-extrabold text-xl tracking-tight">
        {reconsider ? 'Changed your mind?' : 'You’re invited'}
      </p>
      {expiresAtIso && (
        <p className="text-sm text-ink-soft mt-0.5">
          Respond {formatRelative(expiresAtIso)} - after that the invitation
          quietly moves on. No hard feelings either way.
        </p>
      )}
      {questions.length > 0 && !declining && (
        <div className="mt-4">
          <RsvpQuestions
            questions={questions}
            values={answers}
            disabled={pending}
            onChange={(id, value) =>
              setAnswers((current) => ({ ...current, [id]: value }))
            }
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-deep mt-2">
          {error}
          {errorCode && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(errorCode)}
            </span>
          )}
        </p>
      )}
      {!declining ? (
        <div className="flex gap-2.5 mt-4">
          <Button
            variant="accept"
            className="flex-1"
            disabled={pending}
            onClick={() => respond(true)}
          >
            I’m in
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={pending}
            onClick={() => (reconsider ? setReopened(false) : setDeclining(true))}
          >
            {reconsider ? 'Never mind' : 'Can’t make it'}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-2 animate-rise">
          <p className="text-sm text-ink-soft">No problem - which is it?</p>
          <label className="block pb-1">
            <span className="mb-1 block text-xs font-semibold text-ink-soft">
              Optional note to the host
            </span>
            <textarea
              value={declineMessage}
              onChange={(event) => setDeclineMessage(event.target.value.slice(0, 280))}
              maxLength={280}
              rows={3}
              placeholder="A sentence is plenty — no explanation required."
              className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-terracotta"
            />
            <span className="mt-1 block text-right text-[11px] text-ink-faint">
              {declineMessage.length}/280
            </span>
          </label>
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => respond(false, 'keep_asking')}
          >
            Can’t this time - keep asking!
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
