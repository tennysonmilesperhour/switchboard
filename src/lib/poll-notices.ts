/**
 * Who hears about a poll, and what they are told.
 *
 * Pure, so the audience and every sentence can be tested without a database.
 * The server side (`src/lib/server/poll-notices.ts`) reads the rows and sends.
 *
 * A group decision used to be silent at every step that mattered: creating a
 * plan that starts as a vote told nobody there was a vote, a follow-up question
 * only reached people who had already said yes, and a poll closing at its
 * deadline told nobody the result — including a host whose pick it now was.
 */

import { OPTION_LABEL_MAX, ideaKey, prepareOptionFields } from '@/lib/poll-option-input';

/** A notification ready for `notifyUsers`. */
export interface PollNotice {
  kind: string;
  title: string;
  body: string;
  url: string;
}

export interface AudienceInput {
  eventStatus: string;
  hostId: string;
  cohostIds: ReadonlyArray<string | null>;
  invites: ReadonlyArray<{ invitee_id: string | null; status: string }>;
}

/**
 * The people a poll is put to.
 *
 * Managers (host and co-hosts) run it. Guests answer it: everyone who has said
 * yes, and — while the plan is still `deciding` — everyone on the list, because
 * a deciding plan's whole invited group is meant to vote before any invitation
 * goes out (`can_view_event` lets queued invitees in for exactly that).
 * Declined, expired and cancelled invites are not asked again.
 */
export function pollAudience({ eventStatus, hostId, cohostIds, invites }: AudienceInput): {
  managers: string[];
  guests: string[];
} {
  const managers = [...new Set([hostId, ...cohostIds].filter((id): id is string => Boolean(id)))];
  const managerSet = new Set(managers);
  const guests = new Set<string>();
  for (const invite of invites) {
    if (!invite.invitee_id || managerSet.has(invite.invitee_id)) continue;
    const answering =
      invite.status === 'accepted' || (eventStatus === 'deciding' && invite.status === 'queued');
    if (answering) guests.add(invite.invitee_id);
  }
  return { managers, guests: [...guests] };
}

/** Why a poll is newly open to answers. */
export type OpenedReason = 'created' | 'follow-up' | 'runoff';

export function pollOpenedNotice({
  eventId,
  eventTitle,
  question,
  reason,
  hostName,
  needsDate,
}: {
  eventId: string;
  eventTitle: string;
  question: string;
  reason: OpenedReason;
  hostName?: string | null;
  /** The plan has no date yet, so the vote is (also) about when. */
  needsDate?: boolean;
}): PollNotice {
  const url = `/events/${eventId}`;
  if (reason === 'runoff') {
    // The first round's ratings are cleared when a runoff opens, so anyone who
    // voted has to vote again — saying so is the whole point of this notice.
    return {
      kind: 'poll_opened',
      title: `Final round: ${question}`,
      body: `It’s down to the finalists for ${eventTitle}. Ratings start fresh, so rate them again.`,
      url,
    };
  }
  if (reason === 'created') {
    const host = hostName?.trim() || 'Your host';
    return {
      kind: 'poll_opened',
      title: needsDate ? `Help pick the date: ${eventTitle}` : `Help decide: ${eventTitle}`,
      body: needsDate
        ? `${host} wants the group to pick the date before anything is set.`
        : `${host} is asking “${question}” before anything is set.`,
      url,
    };
  }
  return {
    kind: 'poll_opened',
    title: `That's settled — now: ${question}`,
    body: eventTitle ? `Weigh in on ${eventTitle}.` : 'Weigh in when you can.',
    url,
  };
}

/** What deciding the poll did to the plan's date (see `applyDecidedDate`). */
export type DateOutcome =
  | { kind: 'set'; startsAt: string; timeZone: string }
  /** The winner is not a grid time (a free-text idea), or there is no winner. */
  | { kind: 'none' }
  /** The plan already has a date and has moved past deciding; left alone. */
  | { kind: 'kept' }
  /** The winning time has already started, so it cannot be the plan's date. */
  | { kind: 'past' }
  | { kind: 'failed' };

export interface OutcomeInput {
  eventId: string;
  eventTitle: string;
  question: string;
  hostName?: string | null;
  /** The winning idea as people read it, or null when nobody won. */
  winnerLabel: string | null;
  /** How many ideas were on the poll when it closed. */
  ideas: number;
  /** The plan is still `deciding`: invitations are waiting on the decision. */
  deciding: boolean;
  /** The plan has a start time after the decision was applied. */
  hasDate: boolean;
  date: DateOutcome;
  /** The date as people read it, in the plan's zone, when `date` is `set`. */
  dateText?: string | null;
}

/**
 * The two messages a decision sends: one to the people who answered, one to the
 * host and co-hosts, who may now have something to do. Null means that side
 * hears nothing (a poll that closed empty has no result worth announcing to the
 * group; the host is told it is theirs to settle).
 */
export function pollOutcomeNotices(input: OutcomeInput): {
  guests: PollNotice | null;
  managers: PollNotice;
} {
  const { eventId, eventTitle, question, winnerLabel, ideas, deciding, hasDate, date } = input;
  const url = `/events/${eventId}`;
  const host = input.hostName?.trim() || 'The host';
  const when = date.kind === 'set' && input.dateText ? input.dateText : null;

  if (winnerLabel) {
    const kind = when ? 'event_date_set' : 'event_updated';
    const title = `It’s decided: ${winnerLabel}`;
    const settled = `The group settled “${question}” for ${eventTitle}.`;
    const next = !deciding
      ? 'Open the plan for the latest.'
      : date.kind === 'past'
        ? 'That time has already started, so set the date before the invitations go out.'
        : hasDate
          ? 'Send the invitations when you’re ready.'
          : 'Set the date next — the invitations wait for one.';
    return {
      guests: {
        kind,
        title,
        body: when ? `${settled} It’s ${when}.` : settled,
        url,
      },
      managers: {
        kind,
        title,
        body: when ? `${eventTitle} now starts ${when}. ${next}` : `${settled} ${next}`,
        url,
      },
    };
  }

  if (ideas === 0) {
    return {
      guests: null,
      managers: {
        kind: 'event_updated',
        title: `Nothing to choose: ${question}`,
        body: `Voting closed on ${eventTitle} with no ideas on the list. Settle it yourself in Edit plan.`,
        url: `/events/${eventId}/edit`,
      },
    };
  }

  return {
    guests: {
      kind: 'event_updated',
      title: `Voting closed: ${question}`,
      body: `${host} is choosing for ${eventTitle} from what the group said.`,
      url,
    },
    managers: {
      kind: 'event_updated',
      title: `Your pick: ${question}`,
      body: `Voting closed on ${eventTitle} without a clear winner. Choose from what the group suggested.`,
      url,
    },
  };
}

/**
 * The one email a guest gets when a plan starts as a vote (decision D4): the
 * plan's share link, with "help pick the date". Sent once, at creation; the
 * invitation proper follows when the host sends it.
 */
export function decidingGuestEmail({
  guestName,
  hostName,
  eventTitle,
  needsDate,
  shareUrl,
}: {
  guestName: string | null;
  hostName: string | null;
  eventTitle: string;
  needsDate: boolean;
  shareUrl: string;
}): { subject: string; text: string } {
  const hello = guestName?.trim() ? `Hi ${guestName.trim()},` : 'Hi there,';
  const host = hostName?.trim() || 'Someone';
  const ask = needsDate ? 'help pick the date' : 'help decide the details';
  return {
    subject: needsDate ? `Help pick the date: ${eventTitle}` : `Help decide: ${eventTitle}`,
    text:
      `${hello}\n\n` +
      `${host} is planning ${eventTitle} and wants you to ${ask} before anything is set.\n\n` +
      `See the plan and say you’re in: ${shareUrl}\n` +
      `(Sign in - or make an account - when you’re ready to answer and vote.)\n\n` +
      `No pressure either way.\n\n— Switchboard`,
  };
}

/** The text-message form of `decidingGuestEmail`, for a guest who has opted in. */
export function decidingGuestSms({
  hostName,
  eventTitle,
  needsDate,
  shareUrl,
}: {
  hostName: string | null;
  eventTitle: string;
  needsDate: boolean;
  shareUrl: string;
}): string {
  const host = hostName?.trim() || 'Someone';
  const ask = needsDate ? 'help pick the date for' : 'help decide';
  return (
    `Switchboard: ${host} wants you to ${ask} ${eventTitle.slice(0, 100)}. ${shareUrl}\n` +
    'Reply STOP to unsubscribe.'
  );
}

/** How many ideas the wizard may float onto the first poll. */
export const MAX_SEED_OPTIONS = 5;

/**
 * The ideas a host floated in the wizard, cleaned the way the suggestion box
 * cleans one: trimmed, bounded, a pasted link lifted out of the name, blanks
 * and repeats ("Pizza", "pizza!") dropped, at most `MAX_SEED_OPTIONS`.
 *
 * Silently dropping a blank or a repeat is right here — the host sees the list
 * they typed become the poll, and a duplicate would only split votes. An idea
 * too long to be one is cut rather than refused, since refusing would fail the
 * whole plan over an optional extra.
 */
export function cleanSeedOptions(raw: unknown): Array<{ label: string; linkUrl: string | null }> {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const clean: Array<{ label: string; linkUrl: string | null }> = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const text = entry.trim().slice(0, 4096);
    let prepared = prepareOptionFields({ label: text });
    if (!prepared.ok) prepared = prepareOptionFields({ label: text.slice(0, OPTION_LABEL_MAX) });
    if (!prepared.ok) continue;
    const key = ideaKey(prepared.fields.label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    clean.push({ label: prepared.fields.label, linkUrl: prepared.fields.linkUrl });
    if (clean.length === MAX_SEED_OPTIONS) break;
  }
  return clean;
}
