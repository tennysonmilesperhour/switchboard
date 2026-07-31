'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/components/ui/Avatar';
import { Icon } from '@/components/ui/Icon';
import { CopyButton } from '@/components/ui/CopyButton';
import { ShareButton } from '@/components/ui/ShareButton';
import {
  classifyContact,
  messageActionLabel,
  messageHref,
  telHref,
  type OutboundMessage,
} from '@/lib/invitee-contact';

/**
 * Everything the sheet needs about one person on a plan, assembled server-side.
 *
 * `contact`, `inviteUrl`, and `messages` are populated **only for a host or
 * co-host** — the same boundary as the guest links and the invitation flow on
 * the event page. Anyone else gets identity fields alone, so the sheet renders
 * as a plain profile card with nothing private in its props (the props of a
 * client component ship to the browser, so this is a real boundary, not a UI
 * one).
 */
export interface InviteePerson {
  /** Stable key — the invite id, which exists for guests and members alike. */
  id: string;
  name: string;
  /** Set only for someone with a Switchboard account. */
  handle: string | null;
  avatarUrl: string | null;
  /** Colour seed, so the sheet's avatar matches the row that opened it. */
  seed: string;
  /** No account behind this invite: reachable only off-platform. */
  isGuest: boolean;
  /** "Invited - waiting", "Accepted", … Free text; may be null. */
  statusLabel: string | null;
  /** The email or phone this invite was sent to, as the host entered it. */
  contact: string | null;
  /** The link that opens this person's invitation. */
  inviteUrl: string | null;
  /** Prefilled copy, built once on the server (see @/lib/invitee-contact). */
  messages: { plan: OutboundMessage; app: OutboundMessage } | null;
}

/** Is there anything worth opening a sheet for? */
export function inviteeIsTappable(person: InviteePerson): boolean {
  return Boolean(person.handle || person.contact || person.inviteUrl);
}

type MessageChoice = 'plan' | 'app';

const CHOICE_LABEL: Record<MessageChoice, string> = {
  plan: 'Their invitation',
  app: 'Join Switchboard',
};

/**
 * Tap a person on a plan, reach them.
 *
 * The point of this sheet is the case the app used to have no answer for: an
 * invitee with no Switchboard account. Their card is built from what the host
 * typed when they added them, so the host can text or email them straight from
 * the plan — with the invitation, or with an invitation to the app itself —
 * instead of leaving for their phone's contact list to find the same number.
 */
export function InviteeSheet({
  person,
  onClose,
  children,
}: {
  person: InviteePerson;
  onClose: () => void;
  /**
   * Primary action for this card, when the surface has one — "Send invite" on a
   * connection who isn't on the plan yet. Rendered directly under the identity
   * block, above anything to do with reaching them off-platform.
   */
  children?: React.ReactNode;
}) {
  const [choice, setChoice] = useState<MessageChoice>('plan');
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape closes, and the panel takes focus so a keyboard user lands inside
  // the dialog rather than continuing down the page behind it.
  useEffect(() => {
    panelRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const contact = classifyContact(person.contact);
  const message = person.messages?.[choice] ?? null;
  const sendHref = contact && message ? messageHref(contact, message) : null;
  const callHref = contact ? telHref(contact) : null;
  const titleId = `invitee-sheet-${person.id}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="animate-rise w-full max-w-sm rounded-card bg-card p-5 shadow-float outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <Avatar
            name={person.name}
            seed={person.seed}
            src={person.avatarUrl}
            size="lg"
            ring
          />
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-lg font-extrabold tracking-tight text-ink">
              {person.name}
            </h2>
            <p className="truncate text-xs text-ink-faint">
              {person.handle ? `@${person.handle}` : 'Not on Switchboard yet'}
            </p>
            {person.statusLabel && (
              <p className="mt-0.5 text-xs font-semibold text-ink-soft">{person.statusLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-ink-faint hover:bg-cream hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        {contact && (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-card bg-cream px-3.5 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <span className="text-ink-faint">
                <Icon name={contact.kind === 'phone' ? 'phone' : 'mail'} size={16} />
              </span>
              <span className="truncate text-sm font-semibold text-ink">{contact.display}</span>
            </span>
            <CopyButton text={contact.display} label="Copy" className="shrink-0" />
          </div>
        )}

        {/* Which prefilled message the send button opens with. Two, because a
            host reaching someone off-platform is doing one of two things:
            handing them this plan, or getting them onto the app so the next
            one lands in-app. */}
        {contact && person.messages && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(Object.keys(CHOICE_LABEL) as MessageChoice[]).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={choice === key}
                onClick={() => setChoice(key)}
                className={`rounded-pill border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta ${
                  choice === key
                    ? 'border-terracotta bg-terracotta text-white'
                    : 'border-line bg-card text-ink-soft hover:border-terracotta hover:text-terracotta-deep'
                }`}
              >
                {CHOICE_LABEL[key]}
              </button>
            ))}
          </div>
        )}

        {sendHref && contact && (
          <div className="mt-3 flex gap-2">
            <a
              href={sendHref}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-btn bg-brand-gradient px-5 py-2.5 text-[15px] font-bold text-white shadow-lift transition-all hover:brightness-105 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta focus-visible:ring-offset-2"
            >
              <Icon name={contact.kind === 'phone' ? 'chat' : 'mail'} size={16} />
              {messageActionLabel(contact)}
            </a>
            {callHref && (
              <a
                href={callHref}
                className="inline-flex items-center justify-center gap-2 rounded-btn border border-line bg-card px-4 py-2.5 text-[15px] font-bold text-ink transition-all hover:border-terracotta hover:text-terracotta active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta"
              >
                <Icon name="phone" size={16} />
                Call
              </a>
            )}
          </div>
        )}

        {/* The message is prefilled, not sent for them — show it, so nothing
            goes out of a host's own phone number that they haven't read. */}
        {sendHref && message && (
          <p className="mt-2.5 whitespace-pre-wrap rounded-card bg-cream px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
            {message.body}
          </p>
        )}

        {/* No usable contact, but the viewer can still hand over the link. This
            is the honest version of the old dead end: say what is missing and
            what to do instead. */}
        {!contact && person.inviteUrl && (
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            {person.isGuest
              ? 'No email or phone was saved for them, so there’s nothing to text from here. Copy their invitation link and send it however you like.'
              : 'They’re on Switchboard, so their invitation is already waiting in the app. Copy the link if you want to send it anyway.'}
          </p>
        )}

        {(person.inviteUrl || person.handle) && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {person.inviteUrl && (
              <>
                <CopyButton text={person.inviteUrl} label="Copy invite link" />
                <ShareButton url={person.inviteUrl} title={person.name} label="Share" />
              </>
            )}
            {person.handle && (
              <Link
                href={`/u/${person.handle}`}
                className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-card px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:border-terracotta hover:text-terracotta-deep"
              >
                <Icon name="account" size={14} />
                View profile
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
