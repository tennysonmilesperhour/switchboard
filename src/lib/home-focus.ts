/**
 * What Home puts first. "Waiting on you" is the one time-sensitive block on
 * the page, so it must only carry invitations a person can still act on: an
 * unanswered invite to a plan that already happened is noise, not urgency.
 */

export interface PendingInviteEvent {
  id: string;
  title: string;
  starts_at: string | null;
  time_zone?: string | null;
}

export interface PendingInvite<E extends PendingInviteEvent = PendingInviteEvent> {
  id: string;
  /** PostgREST returns an embedded row as an object or a one-element array. */
  event: E | E[] | null;
}

export interface OrderedPendingInvite<E extends PendingInviteEvent = PendingInviteEvent> {
  id: string;
  event: E;
}

/**
 * Keep the invitations that still need an answer and put the soonest first.
 * A plan with no start yet (still being polled) can still be answered, so it
 * stays, after everything with a date. A plan whose start is already behind
 * `now` is dropped: responding to it changes nothing.
 */
export function pendingInvitesInOrder<E extends PendingInviteEvent>(
  invites: readonly PendingInvite<E>[] | null | undefined,
  now: Date,
): OrderedPendingInvite<E>[] {
  const cutoff = now.getTime();
  const kept: OrderedPendingInvite<E>[] = [];
  for (const invite of invites ?? []) {
    const event = Array.isArray(invite.event) ? invite.event[0] : invite.event;
    if (!event) continue;
    if (event.starts_at) {
      const startsAt = Date.parse(event.starts_at);
      if (Number.isNaN(startsAt) || startsAt < cutoff) continue;
    }
    kept.push({ id: invite.id, event });
  }
  return kept.sort((a, b) => {
    const left = a.event.starts_at ? Date.parse(a.event.starts_at) : Number.POSITIVE_INFINITY;
    const right = b.event.starts_at ? Date.parse(b.event.starts_at) : Number.POSITIVE_INFINITY;
    return left - right;
  });
}

export interface HomePlanEvent {
  id: string;
  host_id: string;
  status: string;
  starts_at: string | null;
}

/**
 * Which plans belong in the Home feed: ones you are hosting, ones you said
 * yes to, and ones still deciding their date that you are part of. Read
 * access is wider than that — an invitee can open a plan they declined, and a
 * pending invitation is readable too — so filtering on what you can *see*
 * put a plan you declined in your upcoming list, and showed a pending
 * invitation twice: once under "Waiting on you" and again right below it.
 *
 * A plan with no date yet (still being polled) is upcoming, not past, so it
 * stays; the query is expected to have already dropped dated plans that have
 * started.
 */
export function homePlans<E extends HomePlanEvent>(
  events: readonly E[] | null | undefined,
  {
    userId,
    acceptedEventIds,
    queuedEventIds,
    limit,
  }: {
    userId: string;
    acceptedEventIds: ReadonlySet<string>;
    queuedEventIds: ReadonlySet<string>;
    limit: number;
  },
): E[] {
  const kept: E[] = [];
  for (const event of events ?? []) {
    const hosting = event.host_id === userId;
    const going = acceptedEventIds.has(event.id);
    const deciding = queuedEventIds.has(event.id) && event.status === 'deciding';
    if (!hosting && !going && !deciding) continue;
    kept.push(event);
  }
  return kept
    .sort((a, b) => {
      const left = a.starts_at ? Date.parse(a.starts_at) : Number.POSITIVE_INFINITY;
      const right = b.starts_at ? Date.parse(b.starts_at) : Number.POSITIVE_INFINITY;
      return left - right;
    })
    .slice(0, limit);
}
