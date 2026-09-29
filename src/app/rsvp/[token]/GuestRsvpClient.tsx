'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { claimGuestInvite, respondToGuestInvite } from '@/lib/actions/invites';
import { requestParentalApproval } from '@/lib/actions/parental-approval';
import { errorRef, type ErrorCode } from '@/lib/errors';
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
  /**
   * The plan's id, for the way through to `/events/<id>`. This page is a
   * confirmation card, not the plan: the thread, the host's updates, and the
   * rest of the guest list live on the event page, and without a link there an
   * accepted guest has nowhere to go from here.
   */
  eventId?: string | null;
}

/** The onward link, shown once answering has earned the responder a way in. */
function OpenThePlan({ eventId, tone }: { eventId: string; tone: 'sage' | 'gold' }) {
  return (
    <Link
      href={`/events/${eventId}`}
      className={`mt-4 inline-flex items-center gap-1.5 rounded-pill border bg-card px-4 py-2.5 text-sm font-bold shadow-lift active:scale-[0.98] transition-all ${
        tone === 'sage'
          ? 'border-sage text-sage-deep hover:bg-sage-soft'
          : 'border-gold text-gold-deep hover:bg-gold-soft'
      }`}
    >
      Open the plan
      <Icon name="back" size={15} className="rotate-180" />
    </Link>
  );
}

export function GuestRsvpClient({
  token,
  guestName,
  initialStatus,
  questions = [],
  calendarEvent = null,
  authed = false,
  unclaimed = false,
  eventId = null,
}: GuestRsvpClientProps) {
  const [status, setStatus] = useState(initialStatus);
  const [declining, setDeclining] = useState(false);
  const [declineMessage, setDeclineMessage] = useState('');
  // Answering binds the invite to the account, so the plan becomes reachable
  // the moment someone says yes — even on an invite that arrived unclaimed.
  const [planId, setPlanId] = useState<string | null>(eventId);
  const [error, setError] = useState('');
  const [code, setCode] = useState<ErrorCode | null>(null);
  const [signInNeeded, setSignInNeeded] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [needsApproval, setNeedsApproval] = useState(false);
  const [guardianEmail, setGuardianEmail] = useState('');
  const [guardianNameInput, setGuardianNameInput] = useState('');
  const [approvalSent, setApprovalSent] = useState(false);
  const [inviteId, setInviteId] = useState('');
  const [pending, startTransition] = useTransition();

  // If an invited guest has since created an account (or signed in) and reopened
  // their link, adopt the guest invite onto their account so it stops being
  // invisible everywhere else in the app. Runs once, best-effort.
  useEffect(() => {
    if (authed && unclaimed) {
      void claimGuestInvite(token).then((result) => {
        if (result.eventId) setPlanId(result.eventId);
      });
    }
  }, [authed, unclaimed, token]);

  function respond(
    accept: boolean,
    note: 'keep_asking' | 'not_my_thing' | null = null,
  ) {
    if (accept && !requiredAnswered(questions, answers)) {
      setError('Please answer the required questions');
      setCode(null);
      return;
    }
    setError('');
    setCode(null);
    startTransition(async () => {
      const result = await respondToGuestInvite(
        token,
        accept,
        accept ? answers : {},
        note,
        accept ? '' : declineMessage,
      );
      if (!result.ok) {
        // A session can lapse while an invitation sits open in a tab, and the
        // answer needs one. Offer the way back instead of a dead end — and never
        // treat 'auth_required' as this invitation's new status.
        setSignInNeeded(result.outcome === 'auth_required');
        setError(result.error ?? 'Something went wrong');
        setCode(result.code ?? null);
        if (result.outcome && result.outcome !== 'auth_required') setStatus(result.outcome);
        return;
      }
      if (result.needsApproval && result.inviteId) {
        setNeedsApproval(true);
        setInviteId(result.inviteId);
        if (result.eventId) setPlanId(result.eventId);
        setStatus('accepted');
        return;
      }
      if (result.eventId) setPlanId(result.eventId);
      if (result.warning) setError(result.warning);
      setStatus(result.outcome ?? (accept ? 'accepted' : 'declined'));
    });
  }

  if (needsApproval && status === 'accepted') {
    if (approvalSent) {
      return (
        <div className="mt-8 rounded-card bg-sage-soft p-5 animate-rise">
          <p className="font-bold text-sage-deep">Approval request sent</p>
          <p className="text-sm text-ink-soft mt-2">
            We&rsquo;ve emailed the guardian. Once they approve, the RSVP will count.
          </p>
          {authed && planId && <OpenThePlan eventId={planId} tone="sage" />}
        </div>
      );
    }
    return (
      <div className="mt-8 rounded-card bg-gold-soft p-5 animate-rise">
        <p className="font-bold text-gold-deep">Almost there — guardian approval needed</p>
        <p className="text-sm text-ink-soft mt-2">
          This plan requires a parent or guardian to approve attendance.
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
            value={guardianNameInput}
            onChange={(e) => setGuardianNameInput(e.target.value)}
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
                eventId: planId ?? '',
                guardianEmail: guardianEmail.trim(),
                guardianName: guardianNameInput.trim() || undefined,
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
        {error && <p role="status" className="mt-2 text-sm text-gold-deep">{error}</p>}
        {authed && planId && (
          <>
            <p className="text-sm text-ink-soft mt-3">
              The plan page has the chat, the host’s updates, and who else is
              coming.
            </p>
            <OpenThePlan eventId={planId} tone="sage" />
          </>
        )}
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
        <p className="font-bold">The plan filled up, you’re on the waitlist</p>
        <p className="text-sm text-ink-soft mt-1">
          If a spot opens, the host will reach out.
        </p>
        {/* The thread stays gated to people who are in, but the plan page is
            where any change to that reaches them first. */}
        {authed && planId && <OpenThePlan eventId={planId} tone="gold" />}
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
          {code && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(code)}
            </span>
          )}
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
      {!declining ? (
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
            onClick={() => setDeclining(true)}
          >
            Can’t make it
          </Button>
        </div>
      ) : (
        <div className="space-y-2 animate-rise">
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
          </label>
          <Button
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => respond(false, 'keep_asking')}
          >
            Can’t this time — keep asking! 💛
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
            className="w-full pt-1 text-xs text-ink-faint hover:text-ink"
            onClick={() => setDeclining(false)}
          >
            Go back
          </button>
        </div>
      )}
    </div>
  );
}
