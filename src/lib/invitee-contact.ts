/**
 * How a host reaches one person on a plan.
 *
 * The invite list is the only place the app already knows how to contact
 * somebody who has no Switchboard account: `invites.guest_contact` is the email
 * or phone the host themselves typed when they added that person (or that the
 * person volunteered when they answered a share link). That is the same value
 * the cascade uses to send the invitation, so a host looking at their own plan
 * should not have to leave the app, open Contacts, and find the number again to
 * nudge someone or hand them the link.
 *
 * This module is the one place that turns that string into something tappable.
 * It exists so the two rules that matter live together and are testable:
 *
 *   1. **The address is validated before it is ever put in a URL.** A phone is
 *      normalised to E.164 and an email must match the shared `isEmail` check,
 *      so neither can smuggle a `?`, `&`, or newline into the `sms:`/`mailto:`
 *      it lands in and forge extra headers or recipients (docs/SECURITY.md §6).
 *      Everything user-controlled that follows — the plan title, the host's
 *      name, the link — is `encodeURIComponent`d.
 *   2. **The message copy is built once**, so a text and an email invitation
 *      say the same thing, and so a link is never composed at a call site.
 *
 * Client-safe on purpose: the sheet that renders these hrefs is a client
 * component, so this imports only `isEmail`/`normalizePhoneNumber` and never
 * touches the server-only `looksLikeEmail`.
 */

import { isEmail } from '@/lib/auth-identity';
import { looksLikePhoneNumber, normalizePhoneNumber } from '@/lib/phone';

export type ContactKind = 'phone' | 'email';

export interface ReachableContact {
  kind: ContactKind;
  /**
   * The form that goes in the URL: E.164 for a phone, the trimmed address for
   * an email. Validated — safe to interpolate without further escaping.
   */
  value: string;
  /** What the host typed, kept verbatim for display. */
  display: string;
}

/**
 * Classify a stored `guest_contact`. Returns null for a name-only invite, or
 * for anything that is neither a usable number nor a usable address — the UI
 * treats that as "no way to reach them yet" rather than guessing.
 */
export function classifyContact(raw: string | null | undefined): ReachableContact | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  const phone = normalizePhoneNumber(trimmed);
  if (phone) return { kind: 'phone', value: phone, display: trimmed };

  if (isEmail(trimmed)) return { kind: 'email', value: trimmed, display: trimmed };

  return null;
}

/**
 * Does this string look like a contact rather than a person's name?
 *
 * Guests invited by email or phone have the raw contact stored as their
 * `guest_name`, so every surface that shows a guest's name needs the same test
 * before it prints a phone number where a name belongs.
 */
export function looksLikeContactString(value: string | null | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  return isEmail(trimmed) || looksLikePhoneNumber(trimmed);
}

/**
 * Who to greet once someone has said yes on their invitation page.
 *
 * Their own profile name when the invite is theirs, otherwise the name the host
 * typed for them, unless that is really an email or phone number. Null means
 * greet them without a name: a guest who answered with an account has no
 * `guest_name`, and the old "there" fallback read "You’re in, there!".
 */
export function rsvpGreetingName(
  viewerName: string | null | undefined,
  guestName: string | null | undefined,
): string | null {
  const viewer = viewerName?.trim();
  if (viewer) return viewer;
  const guest = guestName?.trim();
  if (guest && !looksLikeContactString(guest)) return guest;
  return null;
}

export interface OutboundMessage {
  /** Used as the mail subject; ignored by SMS, which is body-only. */
  subject: string;
  body: string;
}

/** `tel:` for a validated number. */
export function telHref(contact: ReachableContact): string | null {
  return contact.kind === 'phone' ? `tel:${contact.value}` : null;
}

/**
 * `sms:` with a prefilled body.
 *
 * `?&body=` rather than `?body=` is deliberate: iOS needs the `&` separator and
 * Android accepts it, so this one form opens the messages app with the text
 * ready on both. Getting it wrong drops the body silently, which looks like the
 * feature simply not working.
 */
export function smsHref(contact: ReachableContact, message: OutboundMessage): string | null {
  if (contact.kind !== 'phone') return null;
  return `sms:${contact.value}?&body=${encodeURIComponent(message.body)}`;
}

/** `mailto:` with a prefilled subject and body. */
export function mailtoHref(contact: ReachableContact, message: OutboundMessage): string | null {
  if (contact.kind !== 'email') return null;
  const query = `subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(
    message.body,
  )}`;
  return `mailto:${encodeURIComponent(contact.value)}?${query}`;
}

/** The one tap that sends this message: text a phone, mail an address. */
export function messageHref(
  contact: ReachableContact,
  message: OutboundMessage,
): string | null {
  return contact.kind === 'phone'
    ? smsHref(contact, message)
    : mailtoHref(contact, message);
}

/** Verb for the send button, so the label always matches what will open. */
export function messageActionLabel(contact: ReachableContact): string {
  return contact.kind === 'phone' ? 'Text' : 'Email';
}

export interface PlanMessageInput {
  eventTitle: string;
  /** Already formatted in the plan's own zone by the caller. */
  when?: string | null;
  where?: string | null;
  hostName?: string | null;
  /** The invitation link to send. Null when the plan has none to offer. */
  inviteUrl: string | null;
}

/**
 * "Here is your invitation" — the message a host sends to hand someone the
 * plan, whether that person has an account or not.
 */
export function planInviteMessage(input: PlanMessageInput): OutboundMessage {
  const title = input.eventTitle.trim() || 'a plan';
  const details = [input.when?.trim(), input.where?.trim()].filter(Boolean).join(' · ');
  const host = input.hostName?.trim();

  const lines = [`You’re invited: ${title}`];
  if (details) lines.push(details);
  if (host) lines.push(`${host} is hosting.`);
  if (input.inviteUrl) {
    lines.push('', `See the plan and reply here - no app needed: ${input.inviteUrl}`);
  }

  return { subject: `You’re invited: ${title}`, body: lines.join('\n') };
}

export interface AppMessageInput {
  appUrl: string;
  eventTitle?: string | null;
  inviteUrl?: string | null;
}

/**
 * "Come join me on here" — the nudge for someone who is on the plan but not on
 * Switchboard. Carries their own invitation along when there is one, because
 * the invitation is the reason they would bother.
 */
export function appInviteMessage(input: AppMessageInput): OutboundMessage {
  const title = input.eventTitle?.trim();
  const lines = [
    'I’m using Switchboard to make plans - invites go out one person at a ' +
      'time, so nobody feels like a backup.',
    '',
    `Get it here: ${input.appUrl}`,
  ];
  if (input.inviteUrl) {
    lines.push(
      '',
      title
        ? `Your invitation to ${title}: ${input.inviteUrl}`
        : `Your invitation: ${input.inviteUrl}`,
    );
  }
  return { subject: 'Join me on Switchboard', body: lines.join('\n') };
}
