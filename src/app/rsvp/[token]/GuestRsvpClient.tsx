'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { claimGuestInvite, respondToGuestInvite } from '@/lib/actions/invites';
import {
  googleCalendarUrl,
  outlookCalendarUrl,
  type CalendarEvent,
} from '@/lib/calendar-links';
import {
  RsvpQuestions,
  requiredAnswered,
  type RsvpQuestion,
} from '@/components/events/RsvpQuestions';

interface GuestRsvpClientProps {
  token: string;
  guestName: string;
  initialStatus: string;
  questions?: RsvpQuestion[];
  /** When present (event has a start time), the accepted state offers add-to-calendar links. */
  calendarEvent?: CalendarEvent | null;
  /** Whether the viewer is signed in. When true, this still-unclaimed guest
   *  invite is linked to their account so it appears in-app, not just here. */
  authed?: boolean;
  /** True when this guest invite has no account attached yet. */
  unclaimed?: boolean;
}

export function GuestRsvpClient({
  token,
  guestName,
  initialStatus,
  questions = [],
  calendarEvent = null,
  authed = false,
  unclaimed = false,
}: GuestRsvpClientProps) {
  const [status, setStatus] = useState(initialStatus);
  const [error, setError] = useState('');
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // If an invited guest has since created an account (or signed in) and reopened
  // their link, adopt the guest invite onto their account so it stops being
  // invisible everywhere else in the app. Runs once, best-effort.
  useEffect(() => {
    if (authed && unclaimed) {
      void claimGuestInvite(token);
    }
  }, [authed, unclaimed, token]);

  function respond(accept: boolean) {
    if (accept && !requiredAnswered(questions, answers)) {
      setError('Please answer the required questions');
      return;
    }
    setError('');
    startTransition(async () => {
      const result = await respondToGuestInvite(token, accept, accept ? answers : {});
      if (!result.ok) {
        // A session can lapse while an invitation sits open in a tab, and the
        // answer needs one. Offer the way back instead of a dead end — and never
        // treat 'auth_required' as this invitation's new status.
        setSignInNeeded(result.outcome === 'auth_required');
        setError(result.error ?? 'Something went wrong');
        if (result.outcome && result.outcome !== 'auth_required') setStatus(result.outcome);
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
        {calendarEvent && (
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={googleCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-pill border border-sage bg-card px-3 py-1.5 text-xs font-bold text-sage-deep hover:bg-sage-soft"
            >
              Add to Google Calendar
            </a>
            <a
              href={outlookCalendarUrl(calendarEvent)}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-pill border border-sage bg-card px-3 py-1.5 text-xs font-bold text-sage-deep hover:bg-sage-soft"
            >
              Outlook
            </a>
          </div>
        )}
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
          {signInNeeded && (
            <>
              {' '}
              <Link
                href={`/login?next=${encodeURIComponent(`/rsvp/${token}`)}`}
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
