'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import {
  RsvpQuestions,
  requiredAnswered,
  type RsvpQuestion,
} from '@/components/events/RsvpQuestions';
import { respondViaShareLink } from '@/lib/actions/invites';
import { requestParentalApproval } from '@/lib/actions/parental-approval';
import { errorRef, type ErrorCode } from '@/lib/errors';

interface ShareLinkRsvpProps {
  shareToken: string;
  /** The signed-in viewer's profile name, when they have one. */
  defaultName: string;
  /** The host's RSVP questions, asked here as they are on `/rsvp/<token>`. */
  questions?: RsvpQuestion[];
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
export function ShareLinkRsvp({
  shareToken,
  defaultName,
  questions = [],
}: ShareLinkRsvpProps) {
  const [name, setName] = useState(defaultName);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  // Shown beside the message when the answer fails. A recipient who says "it
  // won't let me RSVP" is describing five different causes; SB-RSVP-CLOSED and
  // SB-LINK-OFF are two of them, and only the code tells them apart.
  const [code, setCode] = useState<ErrorCode | null>(null);
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const needsName = defaultName.trim().length === 0;
  const [needsApproval, setNeedsApproval] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [approvalSent, setApprovalSent] = useState(false);
  const [inviteId, setInviteId] = useState('');
  const [eventId, setEventId] = useState('');

  function respond(accept: boolean) {
    const trimmed = name.trim();
    if (needsName && !trimmed) {
      // Pure validation — the sentence already says exactly what to change, so
      // no code (see @/lib/errors on where the boundary sits).
      setError('Please add your name so the host knows who’s coming.');
      setCode(null);
      return;
    }
    // Same gate as the per-invite flow: a host's required question is required
    // whichever link the guest opened. Declining never has to answer anything.
    if (accept && !requiredAnswered(questions, answers)) {
      setError('Please answer the required questions');
      setCode(null);
      return;
    }
    setError('');
    setCode(null);
    startTransition(async () => {
      const result = await respondViaShareLink(
        shareToken,
        accept,
        trimmed,
        null,
        accept ? answers : {},
      );
      if (!result.ok) {
        // A session can lapse while an invitation sits open in a tab. Say so and
        // offer the way back, rather than a dead-end "something went wrong".
        setSignInNeeded(result.outcome === 'auth_required');
        setError(result.error ?? 'Something went wrong. Try again.');
        setCode(result.code ?? 'SB-UNKNOWN');
        return;
      }
      if (result.needsApproval && result.eventId) {
        setNeedsApproval(true);
        setEventId(result.eventId);
        if (result.inviteId) setInviteId(result.inviteId);
        return;
      }
      if (result.token) {
        // Their own RSVP page shows the outcome (in, waitlisted, or declined) and
        // stays valid afterwards.
        router.push(`/rsvp/${result.token}`);
      }
    });
  }

  if (approvalSent) {
    return (
      <div className="mt-8 rounded-card bg-sage-soft p-5 animate-rise">
        <p className="font-bold text-sage-deep">Approval request sent</p>
        <p className="text-sm text-ink-soft mt-2">
          We&rsquo;ve emailed the guardian. Once they approve, the RSVP will count.
        </p>
      </div>
    );
  }

  if (needsApproval) {
    return (
      <div className="mt-8 rounded-card bg-gold-soft p-5 animate-rise">
        <p className="font-bold text-gold-deep">Almost there &mdash; guardian approval needed</p>
        <p className="text-sm text-ink-soft mt-2">
          This plan requires a parent or guardian to approve attendance.
          Enter their email and we&rsquo;ll send them a link.
        </p>
        <label className="block mt-4">
          <span className="block text-sm font-bold text-ink mb-1">Guardian&rsquo;s email</span>
          <input
            type="email"
            value={guardianEmail}
            onChange={(e) => setGuardianEmail(e.target.value)}
            disabled={pending}
            placeholder="parent@example.com"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30"
          />
        </label>
        <label className="block mt-3">
          <span className="block text-sm font-bold text-ink mb-1">Guardian&rsquo;s name (optional)</span>
          <input
            type="text"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            disabled={pending}
            placeholder="First name"
            className="w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-rose-deep mt-3">
            {error}
            {code && (
              <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
                {errorRef(code)}
              </span>
            )}
          </p>
        )}
        <Button
          variant="accept"
          size="lg"
          className="w-full mt-4"
          disabled={pending || !guardianEmail.trim()}
          onClick={() => {
            setError('');
            setCode(null);
            startTransition(async () => {
              const res = await requestParentalApproval({
                inviteId,
                eventId,
                guardianEmail: guardianEmail.trim(),
                guardianName: guardianName.trim() || undefined,
              });
              if (!res.ok) {
                setError(res.error ?? 'Could not send the approval request.');
                setCode(res.code ?? null);
                return;
              }
              setApprovalSent(true);
            });
          }}
        >
          Send approval request
        </Button>
      </div>
    );
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
      {questions.length > 0 && (
        <div className="mb-4 rounded-card bg-cream p-4">
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
        <p role="alert" className="text-sm text-rose-deep mb-3">
          {error}
          {code && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(code)}
            </span>
          )}
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
