/**
 * One answer to "what does this invite link do right now?"
 *
 * Shared plan links broke for recipients over and over, and every fix was a
 * local one. The reason is visible the moment you line the surfaces up: the
 * question "is this link usable?" was answered independently in six places, by
 * five different rules.
 *
 *   /i/<token> (page)          share_link_active && status in (inviting, confirmed)
 *   /i/<token> (metadata)      share_link_active
 *   /events/<id> Share button  — no rule at all, always offered
 *   /events/<id> Invite card   status in (inviting, confirmed)
 *   /api/og/event/<id>         status not in (draft, cancelled)
 *   rsvp_via_share_token()     share_link_active, then status in (inviting, confirmed)
 *
 * The failure mode follows mechanically. The sender-side rule was *looser* than
 * the recipient-side rule, so the app happily handed a host a link its own
 * recipient page would reject. A plan with a date poll sits in `deciding` for as
 * long as the poll runs — the host sees a Share button the whole time, and every
 * person who taps what it produced is told "This invite link isn't active."
 * Fixing one pair of rules never held, because the next slight deviation landed
 * on a pair that was still misaligned.
 *
 * So the rule lives here, once, and every surface asks this module instead of
 * re-deriving it. The invariants below are what actually prevent the recurrence,
 * and they are enforced by the matrix test in share-link.test.ts:
 *
 *   1. Every (status × share_link_active) combination maps to exactly one state.
 *      No combination falls through to a default.
 *   2. hostCanShare(state) implies canReadPlan(state). The app must never offer
 *      a share affordance whose link lands on a dead end. This is the invariant
 *      that was violated, and it is the one worth remembering.
 *   3. canAnswer(state) implies hostCanShare(state) implies canReadPlan(state) —
 *      capabilities strictly narrow, never cross over.
 *   4. The set of statuses that can be answered matches the tuple inside
 *      rsvp_via_share_token(). TS and SQL drifting apart is its own outage, so
 *      the test parses the migration and compares.
 *
 * Adding an event status? The compiler routes you here (the switch is
 * exhaustive), and the matrix test fails until you have made a decision about
 * what a recipient holding a link sees. That is the point.
 */

import type { ErrorCode } from './errors';
import type { EventStatus } from './types';

/** What a share link does right now, from the recipient's point of view. */
export type ShareLinkState =
  /** No plan behind this token: mistyped, or the host rotated the link. */
  | 'missing'
  /** The host's kill switch is off. */
  | 'off'
  /** Still a draft — the host has not published it. */
  | 'unpublished'
  /** Published, but the date is still being picked. Readable, not answerable. */
  | 'deciding'
  /** Open for business: readable and answerable. */
  | 'live'
  /** The host called it off. */
  | 'cancelled'
  /** Already happened. */
  | 'past';

/** The fields of an event this module needs. Anything wider is fine. */
export interface ShareLinkSubject {
  /** Generated database types expose CHECK-constrained text as `string`. */
  status: string;
  share_link_active: boolean;
}

/**
 * Event statuses that can take an answer through a share link.
 *
 * Mirrors the status guard inside `rsvp_via_share_token`. Kept in sync by a test
 * that reads the migration — a page that offers RSVP buttons the database will
 * refuse is the same class of broken link as one that never rendered.
 *
 * `deciding` is in this set: a plan whose date is still being polled can be
 * answered. Someone who taps a link to a barbecue wants to say they're coming,
 * and "we haven't settled Saturday vs Sunday" is not a reason to turn them away.
 * They accept, and the accepted invite lets them into the plan to vote on the
 * date they just committed to.
 */
export const ANSWERABLE_EVENT_STATUSES: readonly EventStatus[] = [
  'deciding',
  'inviting',
  'confirmed',
];

/**
 * Classify a plan's share link. `null`/`undefined` means the token resolved to
 * nothing, which is a state in its own right rather than an error.
 */
export function shareLinkState(event: ShareLinkSubject | null | undefined): ShareLinkState {
  if (!event) return 'missing';
  // The kill switch outranks status: a host who turned the link off has said
  // "this link, specifically, should stop working", whatever the plan is doing.
  if (!event.share_link_active) return 'off';
  switch (event.status) {
    case 'draft':
      return 'unpublished';
    case 'deciding':
      return 'deciding';
    case 'inviting':
    case 'confirmed':
      return 'live';
    case 'cancelled':
      return 'cancelled';
    case 'past':
      return 'past';
    default:
      // A newly introduced or corrupted state must never make a link usable.
      return 'unpublished';
  }
}

/**
 * Does the recipient get to see the plan itself?
 *
 * Holding the token is the authorization (docs/SECURITY.md §5), so the answer is
 * yes for every state that describes a real plan the host chose to share —
 * including ones that can no longer take an answer. Someone who taps a link to a
 * plan that has already happened should be told that, not handed a generic
 * "isn't active" that reads as "the sender did something wrong".
 */
export function canReadPlan(state: ShareLinkState): boolean {
  switch (state) {
    case 'deciding':
    case 'live':
    case 'cancelled':
    case 'past':
      return true;
    case 'missing':
    case 'off':
    case 'unpublished':
      return false;
  }
}

/** Can the recipient RSVP? Must match what `rsvp_via_share_token` will accept. */
export function canAnswer(state: ShareLinkState): boolean {
  return state === 'live' || state === 'deciding';
}

/**
 * Should the app offer the host a way to hand this link out?
 *
 * Invariant 2: this must never be true where `canReadPlan` is false. A Share
 * button that emits a link the recipient page rejects is precisely the bug this
 * module exists to make unrepresentable.
 */
export function hostCanShare(state: ShareLinkState): boolean {
  return state === 'live' || state === 'deciding';
}

/**
 * Can a host or co-host change the invite list at this point in the plan?
 *
 * Invite editing is deliberately narrower than public-link answering: while a
 * date poll is running the existing invitees can respond, but the cascade has
 * not started and its ordering is still derived from the wizard. Once the plan
 * is confirmed, the guest list is locked.
 */
export function hostCanEditInvitees(status: string | null | undefined): boolean {
  return status === 'inviting';
}

/**
 * Can a host reorder, re-time, or take out someone who has not answered yet?
 *
 * Wider than `hostCanEditInvitees` on purpose, and only by `deciding`. While a
 * date poll runs, no invitation has gone out: every invite is queued and the
 * order is still a draft. `move_queued_invite` and `set_invite_window` already
 * accept those edits — they gate on the invite being queued, not on the plan's
 * status — so hiding the controls there did not protect anything. It only left
 * a host looking at a list of people with the hint "reorder or re-time anyone
 * still in line" and no way to do either, which is what the client reported.
 *
 * Adding people is a different question and stays narrower: a guest list that
 * grows mid-poll changes what the people already answering agreed to.
 */
export function hostCanEditLine(status: string | null | undefined): boolean {
  return hostCanEditInvitees(status) || status === 'deciding';
}

/**
 * Can a visitor request a seat through the open-table join page?
 *
 * Both predicates take the generated `string` (see `ShareLinkSubject`) rather
 * than `EventStatus`, so callers pass a row's status straight through; an
 * unknown or corrupted value simply fails the equality and stays closed.
 */
export function canRequestOpenTable(status: string | null | undefined): boolean {
  return status === 'inviting' || status === 'confirmed';
}

/**
 * Should a link preview unfurl the plan's title, time, and place?
 *
 * Stricter than `canReadPlan` on purpose. The OG image is addressed by event
 * *id*, which appears in URLs and is far more guessable than a share token, so
 * it reveals details only while the plan is actively being shared. A cancelled
 * plan renders for someone holding the token but does not unfurl to someone
 * holding the id.
 */
export function unfurlsPlanDetails(state: ShareLinkState): boolean {
  return state === 'live' || state === 'deciding';
}

/** What the recipient is told, in place of (or alongside) the RSVP buttons. */
export interface ShareLinkNotice {
  heading: string;
  body: string;
  /**
   * The code shown beside the message.
   *
   * This is the whole reason `/i/<token>` stopped being diagnosable: four
   * unrelated causes shared one sentence, so a screenshot narrowed nothing. Each
   * state now names itself, and `errors.test.ts` proves every state has a
   * distinct code.
   */
  code: ErrorCode;
}

/** The code for a state, or null when the link simply works. */
export function shareLinkCode(state: ShareLinkState): ErrorCode | null {
  switch (state) {
    case 'live':
      return null;
    case 'missing':
      return 'SB-LINK-UNKNOWN';
    case 'off':
      return 'SB-LINK-OFF';
    case 'unpublished':
      return 'SB-LINK-DRAFT';
    case 'cancelled':
      return 'SB-LINK-CANCELLED';
    case 'past':
      return 'SB-LINK-PAST';
    case 'deciding':
      // Not a failure — the plan is answerable. It carries a code anyway so a
      // host reporting "they say the date isn't set" is unambiguous.
      return 'SB-LINK-DECIDING';
  }
}

/**
 * Recipient-facing copy for a state, or `null` when there is nothing to say
 * because the link simply works.
 *
 * Where this lands on the page follows from `canAnswer`: for a state that can't
 * be answered it stands in for the buttons, and for one that can (`deciding`) it
 * sits above them as a caveat — one copy source, so the two placements can never
 * describe the plan differently.
 *
 * `hostName` is woven in where it makes the message land better; a missing name
 * degrades to "The host" rather than an empty gap.
 */
export function shareLinkNotice(
  state: ShareLinkState,
  hostName?: string | null,
): ShareLinkNotice | null {
  const host = hostName?.trim() || 'The host';
  switch (state) {
    case 'live':
      return null;
    case 'missing':
    case 'off':
      return {
        code: shareLinkCode(state)!,
        heading: 'This invite link isn’t active',
        body:
          'It may have been turned off, or replaced with a newer one. Ask ' +
          'whoever sent it for a fresh link.',
      };
    case 'unpublished':
      return {
        code: shareLinkCode(state)!,
        heading: 'This plan isn’t ready yet',
        body:
          'It’s still being put together. Ask whoever sent the link to send it ' +
          'again once the plan is live.',
      };
    case 'deciding':
      return {
        code: shareLinkCode(state)!,
        heading: 'The date isn’t set yet',
        body:
          `${host} is still choosing between a few. Say you’re in anyway — ` +
          'you’ll get the date the moment it lands, and you can help pick it.',
      };
    case 'cancelled':
      return {
        code: shareLinkCode(state)!,
        heading: 'This plan was called off',
        body: `${host} cancelled it, so there’s nothing to answer. No hard feelings.`,
      };
    case 'past':
      return {
        code: shareLinkCode(state)!,
        heading: 'This one has already happened',
        body: 'You’re seeing the plan as it was. Ask about the next one.',
      };
  }
}

/**
 * What the host is told about their own link, so the state of the link is never
 * a surprise discovered through a recipient's text message.
 */
export function hostShareGuidance(state: ShareLinkState): string | null {
  switch (state) {
    case 'live':
      return null;
    case 'deciding':
      return (
        'The date isn’t settled yet, and the link works anyway: anyone you send ' +
        'it to can see the plan and say they’re in. They’ll get the date once ' +
        'you close the poll, so there’s no need to resend it.'
      );
    case 'off':
      return (
        'This link is turned off, so anyone who already has it sees “this ' +
        'invite link isn’t active”. Turn it back on to share the plan again.'
      );
    case 'unpublished':
      return 'Publish the plan and the link starts working.';
    case 'cancelled':
      return 'This plan is cancelled, so the link now tells anyone who opens it that it’s off.';
    case 'past':
      return 'This plan has happened, so the link now shows it as a past plan.';
    case 'missing':
      return null;
  }
}
