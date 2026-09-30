'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { errorRef, type ErrorCode } from '@/lib/errors';
import { maskEmail, type GuardianRequestView } from '@/lib/guardian-approval';
import { requestParentalApproval } from '@/lib/actions/parental-approval';

interface GuardianApprovalStepProps {
  inviteId: string;
  eventId: string;
  /** The newest guardian request for this invite, if one was ever made. */
  request: GuardianRequestView | null;
  /**
   * Whether the reader may send the request: signed in as the invitee. The
   * card still renders without it, so a signed-out reader of a forwarded
   * `/rsvp` link learns the RSVP is waiting — just not how to change that.
   */
  canSend: boolean;
}

const INPUT =
  'w-full rounded-card border border-line bg-paper px-3.5 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-terracotta focus:outline-none focus:ring-2 focus:ring-terracotta/30';

/**
 * A yes that is waiting on a parent or guardian, and the way to ask them.
 *
 * This used to be a step inside the RSVP buttons' own state, so closing the
 * tab lost it: the yes stayed counted, no guardian was ever asked, and nothing
 * anywhere said so. The held yes now lives on the invite
 * (`pending_approval`), and every surface that shows someone their invitation
 * renders this card from it — the plan page, `/rsvp/<token>`, and the share
 * link's hand-off — so the step is there whenever they come back.
 *
 * It also says what happened to the email. "We've emailed the guardian" used
 * to show whether or not anything was sent; now a saved-but-unsent request
 * says exactly that, with its code, and offers to send it again.
 */
export function GuardianApprovalStep({
  inviteId,
  eventId,
  request,
  canSend,
}: GuardianApprovalStepProps) {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState(
    request === null || (request.emailStatus !== null && request.emailStatus !== 'sent'),
  );
  const [error, setError] = useState<{ message: string; code: ErrorCode | null } | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (request?.status === 'denied') {
    return (
      <div className="rounded-card bg-cream p-5 animate-rise">
        <p className="font-bold">Your guardian didn’t approve this one</p>
        <p className="mt-1 text-sm text-ink-soft">
          Your RSVP was withdrawn, so it doesn’t count and nobody is holding a
          spot for it. If that’s a mix-up, talk to them and to the host.
        </p>
      </div>
    );
  }

  function send() {
    const address = email.trim();
    if (!address) return;
    setError(null);
    startTransition(async () => {
      const result = await requestParentalApproval({
        inviteId,
        eventId,
        guardianEmail: address,
        guardianName: name.trim() || undefined,
      });
      if (result.ok) {
        setSentTo(maskEmail(address));
        setOpen(false);
        router.refresh();
        return;
      }
      setError({
        message: result.error ?? 'Could not send the approval request.',
        code: result.code ?? null,
      });
      // Saved even though the email failed: the card below should now talk
      // about that saved request, not offer to create a first one.
      if (result.approvalId) router.refresh();
    });
  }

  // What we can truthfully say about the newest request. Just sent from this
  // card: it went. Otherwise the stored outcome decides — a request whose
  // email failed must never read as delivered after a reload.
  const lastSent = sentTo ?? request?.sentTo ?? null;
  const delivered = sentTo !== null || request?.emailStatus === 'sent';
  const undelivered =
    sentTo === null && request !== null && request.emailStatus !== null && !delivered;

  return (
    <div className="rounded-card bg-gold-soft p-5 animate-rise">
      <p className="font-bold text-gold-deep">
        {lastSent ? 'Waiting on a guardian' : 'One more step - a guardian needs to approve'}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        This plan needs a parent or guardian to approve your RSVP. Until they
        do, it doesn’t count and doesn’t hold a spot.
      </p>
      {lastSent && (
        <p role="status" className="mt-2 text-sm text-ink">
          {undelivered ? (
            <>
              We couldn’t email <strong className="font-bold">{lastSent}</strong>,
              so they haven’t been asked yet. Check the address and send it again.
            </>
          ) : delivered ? (
            <>
              We emailed <strong className="font-bold">{lastSent}</strong>. It
              counts the moment they approve.
            </>
          ) : (
            <>
              Your request is with <strong className="font-bold">{lastSent}</strong>.
              It counts the moment they approve.
            </>
          )}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose-deep">
          {error.message}
          {error.code && (
            <span className="ml-1.5 font-mono text-[11px] uppercase tracking-wide text-ink-faint">
              {errorRef(error.code)}
            </span>
          )}
        </p>
      )}
      {!canSend ? (
        <p className="mt-3 text-xs text-ink-faint">
          Sign in as the person who said yes to send or resend the request.
        </p>
      ) : open ? (
        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-ink">Guardian’s email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="parent@example.com"
              autoComplete="off"
              className={INPUT}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-ink">
              Guardian’s name (optional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="First name"
              className={INPUT}
            />
          </label>
          <p className="text-xs text-ink-faint">
            They’ll see the plan’s name, when and where it is, who’s hosting,
            and that you said yes - nothing else.
          </p>
          <Button
            variant="accept"
            size="lg"
            className="w-full"
            disabled={pending || !email.trim()}
            onClick={send}
          >
            {pending ? 'Sending…' : lastSent ? 'Send it again' : 'Send approval request'}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-bold text-terracotta-deep"
        >
          Didn’t arrive, or wrong address? Send it again
        </button>
      )}
    </div>
  );
}
